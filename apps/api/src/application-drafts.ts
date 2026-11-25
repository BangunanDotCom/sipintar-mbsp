import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { authorize, fail } from "./auth.js";
import { documentSubmissionReadiness } from "./document-submission-readiness.js";
import { postgresAuth } from "./auth-repository.js";
import {
  postgresDraftRepository,
  type DraftTransaction,
} from "./draft-repository.js";
export { postgresCompanyAuthority as companyAuthority } from "./draft-repository.js";
import {
  validDraftApplicantContext,
  isDraftApplicantCapacity,
} from "./draft-applicant-context.js";
import { documentReadinessGuidance } from "./document-readiness-guidance.js";
import {
  applicationDraftSchema,
  applicationDraftUpdateSchema,
} from "../../../packages/shared/src/index.js";

type UserProfile = {
  id: string;
  name: string;
  email: string;
  phone: string;
  identificationMasked: string | null;
};
function individual(user: UserProfile) {
  return {
    userId: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    identificationMasked: user.identificationMasked,
  };
}
export async function applicant(req: FastifyRequest, auth = postgresAuth) {
  const s = await authorize(req, "applications.draft", auth);
  if (s.user.kind !== "APPLICANT")
    fail(403, "Permohonan baharu hanya untuk akaun pemohon.");
  if (!s.user.identificationHash)
    fail(409, "Lengkapkan nombor pengenalan dalam Profil saya dahulu.");
  return s;
}
async function snapshots(
  tx: DraftTransaction,
  s: Awaited<ReturnType<typeof applicant>>,
  input: z.infer<typeof applicationDraftSchema>,
) {
  // Explicit safe DTOs: no encrypted identification, hash, password or client-supplied identity.
  const profile = individual(s.user);
  if (input.capacity === "INDIVIDUAL")
    return {
      capacity: input.capacity,
      officialApplicantUserId: s.userId,
      companyId: null,
      applicantSnapshot: profile,
      representativeSnapshot: null,
    };
  const r = await tx.companyAuthority(s.userId, input.companyId),
    c = r.company;
  return {
    capacity: input.capacity,
    officialApplicantUserId: null,
    companyId: c.id,
    applicantSnapshot: {
      companyId: c.id,
      name: c.name,
      registrationNumber: c.registrationNumber,
      address: c.address,
      email: c.email,
      phone: c.phone,
      informationStatus: c.informationStatus,
    },
    representativeSnapshot: {
      ...profile,
      representativeId: r.id,
      authorityType: r.authorityType,
      status: r.status,
    },
  };
}
export async function applicationDraftRoutes(
  app: FastifyInstance,
  repository = postgresDraftRepository,
  auth = postgresAuth,
) {
  app.get("/api/application-drafts/context", async (req) => {
    const s = await applicant(req, auth);
    return {
      individual: individual(s.user),
      initiatedBy: individual(s.user),
      companies: (await repository.allowedCompanies(s.userId)).map((r) => ({
        id: r.companyId,
        name: r.company.name,
        registrationNumber: r.company.registrationNumber,
        address: r.company.address,
        email: r.company.email,
        phone: r.company.phone,
        informationStatus: r.company.informationStatus,
        representative: {
          ...individual(s.user),
          representativeId: r.id,
          authorityType: r.authorityType,
          status: r.status,
        },
      })),
      submissionEnabled: false,
    };
  });
  app.get("/api/application-drafts", async (req, reply) => {
    reply.header("Cache-Control", "private, no-store, max-age=0");
    reply.header("Pragma", "no-cache");
    const s = await applicant(req, auth),
      companyIds = (await repository.allowedCompanies(s.userId)).map(
        (r) => r.companyId,
      );
    return repository.list(s.userId, companyIds);
  });
  app.post("/api/application-drafts", async (req, reply) => {
    const s = await applicant(req, auth),
      input = applicationDraftSchema.parse(req.body);
    const draft = await repository.transaction(async (tx) => {
      const data = await snapshots(tx, s, input);
      const d = await tx.createDraft({
        ...data,
        initiatedByUserId: s.userId,
        initiatorSnapshot: individual(s.user),
        notes: input.notes,
      });
      await tx.audit({
        actorId: s.userId,
        activeRole: s.activeRole,
        action: "APPLICATION_DRAFT_CREATED",
        target: d.id,
        metadata: { capacity: d.capacity },
      });
      return d;
    });
    reply.code(201);
    return draft;
  });
  app.get("/api/application-drafts/:id", async (req, reply) => {
    reply.header("Cache-Control", "private, no-store, max-age=0");
    reply.header("Pragma", "no-cache");
    const s = await applicant(req, auth),
      { id } = z.object({ id: z.uuid() }).parse(req.params);
    return repository.transaction(async (tx) => {
      const d = await tx.findDraft(s.userId, id);
      if (!d) fail(404, "Draf tidak ditemui.");
      if (
        !isDraftApplicantCapacity(d.capacity) ||
        !validDraftApplicantContext(
          d.capacity,
          d.companyId,
          d.officialApplicantUserId,
          d.initiatedByUserId,
        )
      )
        fail(409, "Maklumat pemohon draf tidak konsisten.");
      if (d.companyId) await tx.companyAuthority(s.userId, d.companyId);
      await tx.audit({
        actorId: s.userId,
        activeRole: s.activeRole,
        action: "APPLICATION_DRAFT_RESUMED",
        target: d.id,
      });
      return d;
    });
  });
  app.patch("/api/application-drafts/:id", async (req) => {
    const s = await applicant(req, auth),
      { id } = z.object({ id: z.uuid() }).parse(req.params),
      input = applicationDraftUpdateSchema.parse(req.body);
    return repository.transaction(async (tx) => {
      const d = await tx.findDraft(s.userId, id);
      if (!d) fail(404, "Draf tidak ditemui.");
      // Reject corrupted persisted applicant context before allowing any mutation.
      if (
        !isDraftApplicantCapacity(d.capacity) ||
        !validDraftApplicantContext(
          d.capacity,
          d.companyId,
          d.officialApplicantUserId,
          d.initiatedByUserId,
        )
      )
        fail(409, "Maklumat pemohon draf tidak konsisten.");
      // Changing capacity must not bypass revoked authority on the original company draft.
      if (d.companyId) await tx.companyAuthority(s.userId, d.companyId);
      const data = await snapshots(tx, s, input);
      const updated = await tx.saveDraft(s.userId, id, input.version, {
        ...data,
        notes: input.notes,
      });
      if (!updated)
        fail(
          409,
          "Draf telah dikemas kini dalam tab lain. Muat semula sebelum menyimpan.",
        );
      await tx.audit({
        actorId: s.userId,
        activeRole: s.activeRole,
        action: "APPLICATION_DRAFT_SAVED",
        target: id,
        metadata: { capacity: data.capacity, version: input.version + 1 },
      });
      return (await tx.findDraft(s.userId, id))!;
    });
  });
  // Read-only pre-submission feedback; this does not activate submission.
  app.get(
    "/api/application-drafts/:id/submission-readiness",
    async (req, reply) => {
      // Sensitive applicant-specific metadata must not be cached by browsers or proxies.
      reply.header("Cache-Control", "private, no-store, max-age=0");
      reply.header("Pragma", "no-cache");
      const s = await applicant(req, auth),
        { id } = z.object({ id: z.uuid() }).parse(req.params);
      return repository.transaction(async (tx) => {
        const draft = await tx.findDraft(s.userId, id);
        if (!draft) fail(404, "Draf tidak ditemui.");
        if (
          !isDraftApplicantCapacity(draft.capacity) ||
          !validDraftApplicantContext(
            draft.capacity,
            draft.companyId,
            draft.officialApplicantUserId,
            draft.initiatedByUserId,
          )
        )
          fail(409, "Maklumat pemohon draf tidak konsisten.");
        if (draft.companyId)
          await tx.companyAuthority(s.userId, draft.companyId);
        const readiness = documentSubmissionReadiness(
          draft.capacity,
          (await tx.documents(id)).map((document) => ({
            ...document,
            supersededAt: document.supersededAt?.toISOString() ?? null,
          })),
        );
        return {
          draftId: draft.id,
          ...readiness,
          guidance: documentReadinessGuidance(draft.capacity, readiness),
          submissionEnabled: false,
        };
      });
    },
  );
  app.post("/api/application-drafts/:id/submit", async (req) => {
    const s = await applicant(req, auth),
      { id } = z.object({ id: z.uuid() }).parse(req.params);
    if (!(await repository.ownsDraft(s.userId, id)))
      fail(404, "Draf tidak ditemui.");
    fail(
      409,
      "Penghantaran rasmi belum dibuka dalam fasa ini. Draf sahaja boleh disimpan.",
    );
  });
}
