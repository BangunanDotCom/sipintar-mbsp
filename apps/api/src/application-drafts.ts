import type { FastifyInstance, FastifyRequest } from "fastify";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { authorize, fail } from "./auth.js";
import { db } from "./core.js";
import { validRepresentative } from "./company-invitations.js";
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
async function applicant(req: FastifyRequest) {
  const s = await authorize(req, "applications.draft");
  if (s.user.kind !== "APPLICANT")
    fail(403, "Permohonan baharu hanya untuk akaun pemohon.");
  if (!s.user.identificationHash)
    fail(409, "Lengkapkan nombor pengenalan dalam Profil saya dahulu.");
  return s;
}
async function allowedCompanies(userId: string) {
  const now = new Date();
  return db.companyRepresentative.findMany({
    where: {
      userId,
      status: { not: "REVOKED" },
      startsAt: { lte: now },
      OR: [{ endsAt: null }, { endsAt: { gt: now } }],
      company: { status: "ACTIVE" },
    },
    include: { company: true },
    orderBy: { company: { name: "asc" } },
  });
}
async function companyAuthority(
  tx: Prisma.TransactionClient,
  userId: string,
  companyId: string,
) {
  // Serialize a save with authority/company changes, then re-read eligibility.
  await tx.$queryRaw`SELECT id FROM company_representatives WHERE "userId" = ${userId} AND "companyId" = ${companyId} FOR SHARE`;
  await tx.$queryRaw`SELECT id FROM companies WHERE id = ${companyId} FOR SHARE`;
  const r = await tx.companyRepresentative.findUnique({
    where: { userId_companyId: { userId, companyId } },
    include: { company: true },
  });
  if (!r || !validRepresentative(r) || r.company.status !== "ACTIVE")
    fail(404, "Draf atau kebenaran syarikat tidak ditemui.");
  return r;
}
async function snapshots(
  tx: Prisma.TransactionClient,
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
  const r = await companyAuthority(tx, s.userId, input.companyId),
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
function persisted(data: Awaited<ReturnType<typeof snapshots>>) {
  return {
    ...data,
    representativeSnapshot:
      data.representativeSnapshot === null
        ? Prisma.DbNull
        : data.representativeSnapshot,
  };
}
export async function applicationDraftRoutes(app: FastifyInstance) {
  app.get("/api/application-drafts/context", async (req) => {
    const s = await applicant(req);
    return {
      individual: individual(s.user),
      initiatedBy: individual(s.user),
      companies: (await allowedCompanies(s.userId)).map((r) => ({
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
  app.get("/api/application-drafts", async (req) => {
    const s = await applicant(req),
      companyIds = (await allowedCompanies(s.userId)).map((r) => r.companyId);
    return db.applicationDraft.findMany({
      where: {
        initiatedByUserId: s.userId,
        status: "DRAFT",
        OR: [
          { capacity: "INDIVIDUAL" },
          { capacity: "COMPANY", companyId: { in: companyIds } },
        ],
      },
      select: {
        id: true,
        capacity: true,
        applicantSnapshot: true,
        status: true,
        version: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: "desc" },
      take: 50,
    });
  });
  app.post("/api/application-drafts", async (req, reply) => {
    const s = await applicant(req),
      input = applicationDraftSchema.parse(req.body);
    const draft = await db.$transaction(async (tx) => {
      const data = await snapshots(tx, s, input);
      const d = await tx.applicationDraft.create({
        data: {
          ...persisted(data),
          initiatedByUserId: s.userId,
          initiatorSnapshot: individual(s.user),
          notes: input.notes,
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: s.userId,
          activeRole: s.activeRole,
          action: "APPLICATION_DRAFT_CREATED",
          target: d.id,
          metadata: { capacity: d.capacity },
        },
      });
      return d;
    });
    reply.code(201);
    return draft;
  });
  app.get("/api/application-drafts/:id", async (req) => {
    const s = await applicant(req),
      { id } = z.object({ id: z.uuid() }).parse(req.params);
    return db.$transaction(async (tx) => {
      const d = await tx.applicationDraft.findFirst({
        where: { id, initiatedByUserId: s.userId, status: "DRAFT" },
      });
      if (!d) fail(404, "Draf tidak ditemui.");
      if (d.companyId) await companyAuthority(tx, s.userId, d.companyId);
      await tx.auditLog.create({
        data: {
          actorId: s.userId,
          activeRole: s.activeRole,
          action: "APPLICATION_DRAFT_RESUMED",
          target: d.id,
        },
      });
      return d;
    });
  });
  app.patch("/api/application-drafts/:id", async (req) => {
    const s = await applicant(req),
      { id } = z.object({ id: z.uuid() }).parse(req.params),
      input = applicationDraftUpdateSchema.parse(req.body);
    return db.$transaction(async (tx) => {
      const d = await tx.applicationDraft.findFirst({
        where: { id, initiatedByUserId: s.userId, status: "DRAFT" },
      });
      if (!d) fail(404, "Draf tidak ditemui.");
      // Changing capacity must not bypass revoked authority on the original company draft.
      if (d.companyId) await companyAuthority(tx, s.userId, d.companyId);
      const data = await snapshots(tx, s, input);
      const updated = await tx.applicationDraft.updateMany({
        where: {
          id,
          initiatedByUserId: s.userId,
          version: input.version,
          status: "DRAFT",
        },
        data: {
          ...persisted(data),
          notes: input.notes,
          version: { increment: 1 },
        },
      });
      if (!updated.count)
        fail(
          409,
          "Draf telah dikemas kini dalam tab lain. Muat semula sebelum menyimpan.",
        );
      await tx.auditLog.create({
        data: {
          actorId: s.userId,
          activeRole: s.activeRole,
          action: "APPLICATION_DRAFT_SAVED",
          target: id,
          metadata: { capacity: data.capacity, version: input.version + 1 },
        },
      });
      return tx.applicationDraft.findUniqueOrThrow({ where: { id } });
    });
  });
  app.post("/api/application-drafts/:id/submit", async (req) => {
    const s = await applicant(req),
      { id } = z.object({ id: z.uuid() }).parse(req.params);
    if (
      !(await db.applicationDraft.findFirst({
        where: { id, initiatedByUserId: s.userId },
      }))
    )
      fail(404, "Draf tidak ditemui.");
    fail(
      409,
      "Penghantaran rasmi belum dibuka dalam Fasa 2B.1. Draf sahaja boleh disimpan.",
    );
  });
}
