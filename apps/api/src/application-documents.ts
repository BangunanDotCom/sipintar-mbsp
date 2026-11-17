import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { db } from "./core.js";
import { applicant, companyAuthority } from "./application-drafts.js";
import { fail } from "./auth.js";
import { draftDocumentUploadPolicy } from "./draft-document-upload-policy.js";
import { validDraftApplicantContext, isDraftApplicantCapacity } from "./draft-applicant-context.js";

// Read-only metadata endpoint. Never return private object keys or download URLs.
export async function applicationDocumentRoutes(app: FastifyInstance) {
  app.get("/api/application-drafts/:id/documents", async (req, reply) => {
    reply.header("Cache-Control", "private, no-store, max-age=0");
    reply.header("Pragma", "no-cache");
    const s = await applicant(req);
    const { id } = z.object({ id: z.uuid() }).parse(req.params);
    return db.$transaction(async (tx) => {
      const draft = await tx.applicationDraft.findFirst({
        where: { id, initiatedByUserId: s.userId, status: "DRAFT" },
        select: {
          id: true, companyId: true, capacity: true,
          officialApplicantUserId: true, initiatedByUserId: true,
        },
      });
      if (!draft) fail(404, "Draf tidak ditemui.");
      if (!isDraftApplicantCapacity(draft.capacity) || !validDraftApplicantContext(
        draft.capacity, draft.companyId, draft.officialApplicantUserId, draft.initiatedByUserId,
      )) fail(409, "Maklumat pemohon draf tidak konsisten.");
      if (draft.companyId) await companyAuthority(tx, s.userId, draft.companyId);
      const documents = await tx.applicationDocument.findMany({
        where: { draftId: id },
        select: {
          id: true, category: true, version: true, fileName: true,
          mimeType: true, byteSize: true, scanStatus: true,
          verificationStatus: true, uploadedAt: true, supersededAt: true,
        },
        orderBy: [{ category: "asc" }, { version: "desc" }],
      });
      return {
        draftId: id,
        documents,
        uploadPolicy: draftDocumentUploadPolicy(draft.capacity),
        uploadEnabled: false,
        submissionEnabled: false,
      };
    });
  });
}
