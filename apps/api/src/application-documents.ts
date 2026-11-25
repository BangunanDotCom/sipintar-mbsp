import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { postgresAuth } from "./auth-repository.js";
import { postgresDraftRepository } from "./draft-repository.js";
import { applicant } from "./application-drafts.js";
import { fail } from "./auth.js";
import { draftDocumentUploadPolicy } from "./draft-document-upload-policy.js";
import {
  validDraftApplicantContext,
  isDraftApplicantCapacity,
} from "./draft-applicant-context.js";

// Read-only metadata endpoint. Never return private object keys or download URLs.
export async function applicationDocumentRoutes(
  app: FastifyInstance,
  repository = postgresDraftRepository,
  auth = postgresAuth,
) {
  app.get("/api/application-drafts/:id/documents", async (req, reply) => {
    reply.header("Cache-Control", "private, no-store, max-age=0");
    reply.header("Pragma", "no-cache");
    const s = await applicant(req, auth);
    const { id } = z.object({ id: z.uuid() }).parse(req.params);
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
      if (draft.companyId) await tx.companyAuthority(s.userId, draft.companyId);
      const documents = await tx.documents(id);
      return {
        draftId: id,
        capacity: draft.capacity,
        documents,
        uploadPolicy: draftDocumentUploadPolicy(draft.capacity),
        uploadEnabled: false,
        submissionEnabled: false,
      };
    });
  });
}
