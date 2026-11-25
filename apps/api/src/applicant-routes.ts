import argon2 from "argon2";
import { z } from "zod";
import type { FastifyInstance, FastifyRequest } from "fastify";
import {
  companySchema,
  identificationSchema,
  independent,
} from "../../../packages/shared/src/index.js";
import { postgresApplicantRepository } from "./applicant-repository.js";
import { postgresAuth } from "./auth-repository.js";
import { postgresCompanyInvitations } from "./company-invitation-repository.js";
import { validRepresentative } from "./company-representative-policy.js";
import { authorize, session, fail } from "./auth.js";
import { hash, safeUser } from "./core.js";
import { protectIdentification } from "./identity.js";
import {
  delegationLimitMiB,
  validateDelegationPdf,
  UPLOAD_CATEGORIES,
  uploadLimitMiB,
  uploadPolicyKey,
} from "./upload-policy.js";

const id = (req: FastifyRequest) =>
  z.object({ id: z.uuid() }).parse(req.params).id;

export async function applicantRoutes(
  app: FastifyInstance,
  repository = postgresApplicantRepository,
  auth = postgresAuth,
  representatives = postgresCompanyInvitations,
) {
  const { audit, notify } = auth;
  const scopedDistricts = (s: Awaited<ReturnType<typeof authorize>>) =>
    s.assignments.every((a) => a.districtId !== null);
  async function ownCompany(req: FastifyRequest, companyId: string) {
    const s = await authorize(req, "companies", auth);
    const representative = await representatives.representative(
      s.userId,
      companyId,
    );
    if (!representative || !validRepresentative(representative))
      fail(404, "Rekod tidak ditemui.");
    return s;
  }
  app.post("/api/profile/identification", async (req) => {
    const s = await session(req, true, auth);
    if (s.user.kind !== "APPLICANT") fail(403, "Akaun pemohon diperlukan.");
    const b = z
      .object({
        identificationNumber: identificationSchema,
        currentPassword: z.string().max(128),
      })
      .parse(req.body);
    if (s.user.identificationHash)
      fail(
        409,
        "Nombor pengenalan telah ditetapkan. Hubungi pentadbir untuk pembetulan.",
      );
    if (
      !s.user.passwordHash ||
      !(await argon2.verify(s.user.passwordHash, b.currentPassword))
    )
      fail(400, "Kata laluan semasa tidak sah.");
    const data = protectIdentification(b.identificationNumber);
    if (
      !(await repository.setIdentification(s.userId, s.user.passwordHash, data))
    )
      fail(
        409,
        "Nombor pengenalan telah ditetapkan atau profil telah berubah.",
      );
    await audit(s.userId, s.activeRole, "IDENTIFICATION_ADDED", s.userId);
    return { identificationMasked: data.identificationMasked };
  });
  app.get("/api/public/districts", () => repository.districts());
  app.patch("/api/profile", async (req) => {
    const s = await session(req, true, auth);
    const b = z
      .object({
        name: z.string().trim().min(3).max(120),
        phone: z.string().regex(/^\+?[0-9 -]{8,20}$/),
      })
      .parse(req.body);
    const u = await repository.updateProfile(s.userId, b);
    await audit(s.userId, s.activeRole, "PROFILE_UPDATED", s.userId);
    return safeUser(u);
  });
  app.get("/api/companies", async (req) => {
    const s = await authorize(req, "companies", auth);
    return repository.companies(s.userId);
  });
  app.post("/api/companies", async (req, reply) => {
    const s = await authorize(req, "companies", auth);
    if (!s.user.identificationHash)
      fail(409, "Lengkapkan nombor pengenalan dalam Profil saya dahulu.");
    const b = companySchema.parse(req.body);
    if (b.endsAt && new Date(b.endsAt) <= new Date())
      fail(400, "Tarikh tamat mesti pada masa hadapan.");
    const { authorityType, endsAt, ...data } = b;
    let c;
    try {
      c = await repository.createCompany(
        s.userId,
        data,
        authorityType,
        endsAt ? new Date(endsAt) : null,
      );
    } catch (e: any) {
      if (e.code === "P2002")
        fail(
          409,
          "Nombor SSM telah didaftarkan. Hubungi bantuan untuk pengesahan perwakilan; akses tidak diberikan secara automatik.",
        );
      throw e;
    }
    await audit(s.userId, s.activeRole, "COMPANY_CREATED", c.id);
    reply.code(201);
    return c;
  });
  app.patch("/api/companies/:id", async (req) => {
    const companyId = id(req),
      s = await ownCompany(req, companyId);
    const b = companySchema
      .pick({ name: true, address: true, phone: true, email: true })
      .parse(req.body);
    const result = await repository.updateCompany(companyId, b, s.userId);
    await audit(s.userId, s.activeRole, "COMPANY_UPDATED", companyId);
    return result;
  });
  app.post("/api/companies/:id/representatives", async (req) => {
    const companyId = id(req);
    await ownCompany(req, companyId);
    fail(
      409,
      "Gunakan jemputan wakil syarikat; penerima perlu menerima melalui akaun sendiri.",
    );
  });
  app.get("/api/upload-limits", async (req) => {
    await session(req, true, auth);
    const keys = Object.keys(
      UPLOAD_CATEGORIES,
    ) as (keyof typeof UPLOAD_CATEGORIES)[];
    const settings = await repository.settings([
      "technical.upload_delegation_mib",
      ...keys.map(uploadPolicyKey),
    ]);
    const values = new Map(settings.map((item) => [item.key, item.value]));
    const maxMiB = delegationLimitMiB(
      values.get("technical.upload_delegation_mib"),
    );
    const categories = Object.fromEntries(
      (
        Object.keys(UPLOAD_CATEGORIES) as (keyof typeof UPLOAD_CATEGORIES)[]
      ).map((category) => [
        category,
        {
          maxMiB: uploadLimitMiB(
            category,
            values.get(uploadPolicyKey(category)),
          ),
          mime: UPLOAD_CATEGORIES[category].mime,
        },
      ]),
    );
    return { delegationPdfMiB: maxMiB, categories };
  });
  app.post("/api/companies/:id/documents", async (req) => {
    const companyId = id(req),
      s = await ownCompany(req, companyId);
    const b = z
      .object({
        fileName: z
          .string()
          .min(1)
          .max(120)
          .regex(/^[^/\\]+\.pdf$/i),
        content: z
          .string()
          .max(27962028)
          .regex(/^[A-Za-z0-9+/]*={0,2}$/),
        validUntil: z.iso.datetime().optional(),
      })
      .parse(req.body);
    if (b.validUntil && new Date(b.validUntil) <= new Date())
      fail(400, "Tarikh sah dokumen mesti pada masa hadapan.");
    const [setting] = await repository.settings([
      "technical.upload_delegation_mib",
    ]);
    const maxMiB = delegationLimitMiB(setting?.value);
    let content: Buffer;
    try {
      content = validateDelegationPdf(b.content, maxMiB);
    } catch (error) {
      fail(
        400,
        error instanceof Error ? error.message : "Dokumen PDF tidak sah.",
      );
    }
    const doc = await repository.uploadDelegation({
      companyId,
      uploadedBy: s.userId,
      fileName: b.fileName,
      mimeType: "application/pdf",
      content: new Uint8Array(content),
      sha256: hash(content.toString("base64")),
      validUntil: b.validUntil ? new Date(b.validUntil) : null,
    });
    await audit(s.userId, s.activeRole, "DOCUMENT_UPLOADED", doc.id);
    return doc;
  });
  app.get("/api/documents/:id", async (req, reply) => {
    const doc = await repository.delegation(id(req));
    if (!doc) fail(404, "Dokumen tidak ditemui.");
    const s = await ownCompany(req, doc.companyId);
    await audit(s.userId, s.activeRole, "DOCUMENT_READ", doc.id);
    reply
      .header(
        "Content-Disposition",
        `attachment; filename="${encodeURIComponent(doc.fileName)}"`,
      )
      .type("application/pdf");
    return Buffer.from(doc.content);
  });
  // Fasa 1: authorized PIC verification is explicit; no counter clerk role receives this permission.
  app.get("/api/representations", async (req) => {
    const s = await authorize(req, "representation.verify", auth);
    const districts = scopedDistricts(s);
    if (districts)
      fail(
        403,
        "Dokumen belum dipautkan kepada lokasi permohonan. Pengesahan memerlukan PIC dengan skop seluruh daerah atau proses Fasa 2.",
      );
    await audit(s.userId, s.activeRole, "REPRESENTATION_LIST_READ");
    return repository.representations();
  });
  app.get("/api/representation-documents/:id", async (req, reply) => {
    const s = await authorize(req, "representation.verify", auth);
    if (scopedDistricts(s))
      fail(403, "Skop kawasan belum dapat ditentukan tanpa permohonan.");
    const doc = await repository.delegation(id(req));
    if (!doc) fail(404, "Dokumen tidak ditemui.");
    await audit(s.userId, s.activeRole, "REPRESENTATION_DOCUMENT_READ", doc.id);
    reply
      .header(
        "Content-Disposition",
        `attachment; filename="${encodeURIComponent(doc.fileName)}"`,
      )
      .type("application/pdf");
    return Buffer.from(doc.content);
  });
  app.post("/api/representations/:id/verify", async (req) => {
    const s = await authorize(req, "representation.verify", auth);
    if (scopedDistricts(s))
      fail(403, "Skop kawasan belum dapat ditentukan tanpa permohonan.");
    const rep = await repository.representative(id(req));
    if (!independent(rep.userId, s.userId))
      fail(403, "Pengesah bebas diperlukan.");
    const b = z
      .object({
        status: z.enum(["VERIFIED", "DOCUMENT_UPDATE_REQUIRED"]),
        reason: z.string().min(5).max(500),
      })
      .parse(req.body);
    await repository.verifyRepresentative(
      rep.id,
      rep.companyId,
      s.userId,
      b.status,
    );
    await audit(
      s.userId,
      s.activeRole,
      "REPRESENTATION_VERIFIED",
      rep.id,
      "SUCCESS",
      { reason: b.reason },
    );
    await notify(rep.userId, "COMPANY", "Status perwakilan berubah", b.reason);
    return { ok: true };
  });
}
