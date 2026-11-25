import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { authorize, fail } from "./auth.js";
import { db, audit } from "./core.js";
import { validRepresentative } from "./company-invitations.js";
import { delegationLimitMiB, validateDelegationPdf } from "./upload-policy.js";
import {
  cleanDelegation,
  delegationBytes,
  delegationDigest,
  delegationMetadata,
  delegationSummary,
  lockedDelegation,
  principalAtUse,
  currentDelegationSummaries,
  companyDelegationViews,
} from "./delegation-evidence.js";

type Tx = Prisma.TransactionClient;
const param = z.object({ id: z.uuid() });
const currentDocument = { supersededAt: null, revokedAt: null };
const evidenceUnavailable = () => fail(404, "Dokumen tidak ditemui.");
const pdfHeaders = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy": "sandbox",
  "Referrer-Policy": "no-referrer",
};

async function members(
  tx: Tx,
  companyId: string,
  targetId: string | null,
  userId: string | null,
  write = false,
) {
  // All routes use representative -> company -> document. The scanner only locks documents.
  if (write) {
    await tx.$queryRaw`SELECT id FROM company_representatives WHERE "companyId"=${companyId}
      AND (id=${targetId} OR "userId"=${userId}) ORDER BY id FOR UPDATE`;
  } else {
    await tx.$queryRaw`SELECT id FROM company_representatives WHERE "companyId"=${companyId}
      AND (id=${targetId} OR "userId"=${userId}) ORDER BY id FOR SHARE`;
  }
  await tx.$queryRaw`SELECT id FROM companies WHERE id = ${companyId} FOR SHARE`;
  const company = await tx.company.findFirst({
    where: { id: companyId, status: "ACTIVE" },
    select: { id: true },
  });
  if (!company) return evidenceUnavailable();
  const rows = await tx.companyRepresentative.findMany({
    where: {
      companyId,
      OR: [
        ...(targetId ? [{ id: targetId }] : []),
        ...(userId ? [{ userId }] : []),
      ],
    },
  });
  const self = rows.find((item) => item.userId === userId);
  const target = targetId ? rows.find((item) => item.id === targetId) : self;
  if (
    !target ||
    !validRepresentative(target) ||
    (userId &&
      (!self ||
        !validRepresentative(self) ||
        (self.id !== target.id && !self.canManageRepresentatives)))
  )
    return evidenceUnavailable();
  return target;
}

async function invalidateProof(tx: Tx, repId: string) {
  await tx.companyRepresentative.update({
    where: { id: repId },
    data: {
      status: "UNVERIFIED",
      verifiedBy: null,
      verifiedDocumentId: null,
      verificationRevision: { increment: 1 },
    },
  });
}

export async function delegationRoutes(app: FastifyInstance) {
  app.post("/api/companies/:id/documents", async (req) => {
    const s = await authorize(req, "companies");
    const { id: companyId } = param.parse(req.params);
    const member = await db.companyRepresentative.findUnique({
      where: { userId_companyId: { userId: s.userId, companyId } },
    });
    if (!member || !validRepresentative(member)) evidenceUnavailable();
    const input = z
      .strictObject({
        fileName: z
          .string()
          .min(1)
          .max(120)
          .regex(/^[^/\\]+\.pdf$/i)
          .refine(
            (value) =>
              Buffer.from(value).toString() === value &&
              Array.from(value).every(
                (char) =>
                  char.charCodeAt(0) >= 32 && char.charCodeAt(0) !== 127,
              ),
          ),
        content: z
          .string()
          .max(27962028)
          .regex(/^[A-Za-z0-9+/]*={0,2}$/),
        representativeId: z.uuid().optional(),
        expectedDocumentId: z.uuid().nullable().optional(),
        validFrom: z.iso.datetime().optional(),
        validUntil: z.iso.datetime().optional(),
      })
      .parse(req.body);
    const limit = await db.systemConfiguration.findUnique({
      where: { key: "technical.upload_delegation_mib" },
    });
    let bytes: Buffer;
    try {
      bytes = validateDelegationPdf(
        input.content,
        delegationLimitMiB(limit?.value),
      );
    } catch (error) {
      fail(
        400,
        error instanceof Error ? error.message : "Dokumen PDF tidak sah.",
      );
    }
    return db.$transaction(async (tx) => {
      await principalAtUse(tx, s, "COMPANY");
      const rep = await members(
        tx,
        companyId,
        input.representativeId ?? null,
        s.userId,
        true,
      );
      const now = new Date();
      const validFrom = input.validFrom ? new Date(input.validFrom) : now;
      const validUntil = input.validUntil ? new Date(input.validUntil) : null;
      if (validUntil && (validUntil <= now || validUntil <= validFrom))
        fail(400, "Julat sah dokumen tidak dibenarkan.");
      const prior = await tx.delegationDocument.findFirst({
        where: { representativeId: rep.id, ...currentDocument },
        select: { id: true },
      });
      if ((prior?.id ?? null) !== (input.expectedDocumentId ?? null))
        fail(
          409,
          "Versi surat kuasa sudah berubah. Muat semula sebelum mengganti.",
        );
      const history = await tx.delegationDocument.findFirst({
        where: { representativeId: rep.id },
        orderBy: { version: "desc" },
        select: { version: true },
      });
      if (prior)
        await tx.delegationDocument.update({
          where: { id: prior.id },
          data: { supersededAt: now },
        });
      const doc = await tx.delegationDocument.create({
        data: {
          id: randomUUID(),
          companyId,
          representativeId: rep.id,
          version: (history?.version ?? 0) + 1,
          authorityType: rep.authorityType,
          uploadedBy: s.userId,
          fileName: input.fileName,
          mimeType: "application/pdf",
          content: new Uint8Array(bytes),
          sha256: delegationDigest(bytes),
          byteSize: bytes.length,
          scanStatus: "PENDING",
          validFrom,
          validUntil,
        },
        select: delegationMetadata,
      });
      await invalidateProof(tx, rep.id);
      await tx.auditLog.create({
        data: {
          actorId: s.userId,
          activeRole: s.activeRole,
          action: "DOCUMENT_UPLOADED",
          target: doc.id,
          metadata: {
            representativeId: rep.id,
            version: doc.version,
            supersedes: prior?.id ?? null,
          },
        },
      });
      return { ...delegationSummary(doc), status: "UNVERIFIED" };
    });
  });

  app.post("/api/companies/:id/documents/:documentId/revoke", async (req) => {
    const s = await authorize(req, "companies");
    const { id: companyId, documentId } = param
      .extend({ documentId: z.uuid() })
      .parse(req.params);
    return db.$transaction(async (tx) => {
      await principalAtUse(tx, s, "COMPANY");
      const initial = await tx.delegationDocument.findUnique({
        where: { id: documentId },
        select: { companyId: true, representativeId: true },
      });
      if (!initial?.representativeId || initial.companyId !== companyId)
        return evidenceUnavailable();
      const rep = await members(
        tx,
        companyId,
        initial.representativeId,
        s.userId,
        true,
      );
      const updated = await tx.delegationDocument.updateMany({
        where: { id: documentId, representativeId: rep.id, ...currentDocument },
        data: { revokedAt: new Date() },
      });
      if (updated.count !== 1) fail(409, "Versi surat kuasa tidak lagi aktif.");
      await invalidateProof(tx, rep.id);
      await tx.auditLog.create({
        data: {
          actorId: s.userId,
          activeRole: s.activeRole,
          action: "DELEGATION_DOCUMENT_REVOKED",
          target: documentId,
          metadata: { representativeId: rep.id },
        },
      });
      return { ok: true };
    });
  });

  for (const mode of ["COMPANY", "PIC"] as const) {
    app.get(
      mode === "PIC"
        ? "/api/representation-documents/:id"
        : "/api/documents/:id",
      { exposeHeadRoute: false },
      async (req, reply) => {
        reply.headers(pdfHeaders);
        const s = await authorize(
          req,
          mode === "PIC" ? "representation.verify" : "companies",
        );
        const { id } = param.parse(req.params);
        const action =
          mode === "PIC" ? "REPRESENTATION_DOCUMENT_READ" : "DOCUMENT_READ";
        let result;
        try {
          result = await db.$transaction(async (tx) => {
            await principalAtUse(tx, s, mode);
            const initial = await tx.delegationDocument.findUnique({
              where: { id },
              select: { companyId: true, representativeId: true },
            });
            if (!initial?.representativeId) return evidenceUnavailable();
            const rep = await members(
              tx,
              initial.companyId,
              initial.representativeId,
              mode === "COMPANY" ? s.userId : null,
            );
            const doc = await lockedDelegation(tx, id);
            if (!doc || doc.authorityType !== rep.authorityType)
              return evidenceUnavailable();
            const bytes = await delegationBytes(tx, doc);
            await tx.auditLog.create({
              data: {
                actorId: s.userId,
                activeRole: s.activeRole,
                action,
                target: id,
                metadata: {
                  representativeId: rep.id,
                  version: doc.version,
                  requestId: req.id,
                },
              },
            });
            return { bytes, fileName: doc.fileName };
          });
        } catch (err) {
          await audit(s.userId, s.activeRole, action, id, "DENIED", {
            requestId: req.id,
          });
          throw err;
        }
        return reply
          .header(
            "Content-Disposition",
            `attachment; filename*=UTF-8''${encodeURIComponent(result.fileName).replace(/[!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16))}`,
          )
          .type("application/pdf")
          .send(result.bytes);
      },
    );
  }

  app.get("/api/companies", async (req, reply) => {
    reply.header("Cache-Control", "private, no-store");
    const s = await authorize(req, "companies");
    return db.$transaction(
      async (tx) => {
        await principalAtUse(tx, s, "COMPANY");
        return companyDelegationViews(tx, s.userId, true);
      },
      { isolationLevel: "RepeatableRead" },
    );
  });

  app.get("/api/representations", async (req, reply) => {
    reply.headers(pdfHeaders);
    const s = await authorize(req, "representation.verify");
    return db.$transaction(
      async (tx) => {
        await principalAtUse(tx, s, "PIC");
        const reps = await tx.companyRepresentative.findMany({
          where: {
            status: { not: "REVOKED" },
            company: { status: "ACTIVE" },
            startsAt: { lte: new Date() },
            OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }],
          },
          take: 100,
          include: {
            user: { select: { id: true, name: true } },
            company: { select: { id: true, name: true } },
          },
        });
        const summaries = await currentDelegationSummaries(
          tx,
          reps,
          new Date(),
        );
        return reps.map(({ verifiedDocumentId: _proof, ...rep }) => ({
          ...rep,
          company: { ...rep.company, documents: summaries.get(rep.id) ?? [] },
        }));
      },
      { isolationLevel: "RepeatableRead" },
    );
  });

  app.post("/api/representations/:id/verify", async (req) => {
    const s = await authorize(req, "representation.verify");
    const { id } = param.parse(req.params);
    try {
      const input = z
        .strictObject({
          status: z.enum(["VERIFIED", "DOCUMENT_UPDATE_REQUIRED"]),
          reason: z.string().trim().min(5).max(500),
          documentId: z.uuid(),
          expectedRevision: z.number().int().min(0),
        })
        .parse(req.body);
      return await db.$transaction(async (tx) => {
        await principalAtUse(tx, s, "PIC");
        const initial = await tx.companyRepresentative.findUnique({
          where: { id },
          select: { companyId: true },
        });
        if (!initial) fail(404, "Perwakilan tidak ditemui.");
        const rep = await members(tx, initial.companyId, id, null, true);
        if (rep.userId === s.userId) fail(403, "Pengesah bebas diperlukan.");
        const doc = await lockedDelegation(tx, input.documentId);
        if (
          !doc ||
          doc.representativeId !== rep.id ||
          doc.companyId !== rep.companyId
        )
          return evidenceUnavailable();
        if (doc.uploadedBy === s.userId)
          fail(403, "Pengesah bebas diperlukan.");
        if (input.expectedRevision !== rep.verificationRevision)
          fail(409, "Versi pengesahan sudah berubah.");
        if (
          doc.authorityType !== rep.authorityType ||
          !cleanDelegation(doc, new Date())
        )
          fail(409, "Surat kuasa versi semasa belum layak.");
        await delegationBytes(tx, doc);
        const next = await tx.companyRepresentative.update({
          where: { id },
          data: {
            status: input.status,
            verifiedBy: s.userId,
            verifiedDocumentId: input.status === "VERIFIED" ? doc.id : null,
            verificationRevision: { increment: 1 },
          },
        });
        await tx.auditLog.create({
          data: {
            actorId: s.userId,
            activeRole: s.activeRole,
            action: "REPRESENTATION_VERIFIED",
            target: id,
            metadata: {
              reason: input.reason,
              companyId: rep.companyId,
              representativeId: id,
              documentId: doc.id,
              version: doc.version,
              sha256: doc.sha256,
              authorityType: doc.authorityType,
              previousStatus: rep.status,
              status: next.status,
              revision: next.verificationRevision,
            },
          },
        });
        await tx.notification.create({
          data: {
            userId: rep.userId,
            type: "COMPANY",
            title: "Status perwakilan berubah",
            message: input.reason,
          },
        });
        return {
          ok: true,
          verificationRevision: next.verificationRevision,
          documentVersion: doc.version,
        };
      });
    } catch (err) {
      await audit(
        s.userId,
        s.activeRole,
        "REPRESENTATION_VERIFIED",
        id,
        "DENIED",
        { requestId: req.id },
      );
      throw err;
    }
  });
}
