import { randomUUID } from "node:crypto";
import { z } from "zod";
import { supportingDocumentCategorySchema } from "../../../packages/shared/src/supporting-documents.js";

// Internal object identifiers only. Never expose these keys to applicants.
// Object storage must use private buckets, server-side access and malware scanning.
const uuid = z.uuid();
export function createPrivateDocumentKey(draftId: string, category: string): string {
  const draft = uuid.parse(draftId);
  const kind = supportingDocumentCategorySchema.parse(category);
  return `application-documents/${draft}/${kind}/${randomUUID()}`;
}
export function isPrivateDocumentKeyForDraft(key: string, draftId: string): boolean {
  if (!uuid.safeParse(draftId).success) return false;
  const segments = key.split("/");
  return segments.length === 4 &&
    segments[0] === "application-documents" &&
    segments[1] === draftId &&
    supportingDocumentCategorySchema.safeParse(segments[2]).success &&
    uuid.safeParse(segments[3]).success;
}
