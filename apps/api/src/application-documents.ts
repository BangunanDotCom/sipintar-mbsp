import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { db } from "./core.js";
import { applicant, companyAuthority } from "./application-drafts.js";
import { fail } from "./auth.js";

// Read-only metadata endpoint. Never return private object keys or download URLs.
export async function applicationDocumentRoutes(app: FastifyInstance) {
  app.get("/api/application-drafts/:id/documents", async (req) => {
    const s = await applicant(req);
    const { id } = z.object({ id: z.uuid() }).parse(req.params);
    return db.$transaction(async (tx) => {
      const draft = await tx.applicationDraft.findFirst({
        where: { id, initiatedByUserId: s.userId, status: "DRAFT" },
        select: { id: true, companyId: true },
      });
      if (!draft) fail(404, "Draf tidak ditemui.");
      if (draft.companyId) await companyAuthority(tx, s.userId, draft.companyId);
      const documents = await tx.applicationDocument.findMany({
        where: { draftId: id },
        select: {
          id: true, category: true, version: true, fileName: true,
          mimeType: true, byteSize: true, sha256: true, scanStatus: true,
          verificationStatus: true, uploadedAt: true, supersededAt: true,
        },
        orderBy: [{ category: "asc" }, { version: "desc" }],
      });
      return { draftId: id, documents, uploadEnabled: false, submissionEnabled: false };
    });
  });
}
