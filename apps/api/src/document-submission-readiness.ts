import {
  documentChecklistRows,
  type DocumentStatusRecord,
} from "../../../packages/shared/src/document-checklist-status.js";
import type { SupportingDocumentCategory } from "../../../packages/shared/src/supporting-documents.js";

export type DocumentSubmissionReadiness = {
  ready: boolean;
  blockingCategories: SupportingDocumentCategory[];
  pendingScanCategories: SupportingDocumentCategory[];
  unexpectedActiveDocuments: boolean;
};

// Only mandatory categories block submission. Officer verification is a separate
// post-submission step; CLEAN + not REJECTED is sufficient for this preliminary gate.
// This is not a substitute for authorization, declaration or server-side transaction checks.
export function documentSubmissionReadiness(
  capacity: "INDIVIDUAL" | "COMPANY",
  documents: readonly DocumentStatusRecord[],
): DocumentSubmissionReadiness {
  const blockingCategories: SupportingDocumentCategory[] = [];
  // Never silently ignore an uploaded document that is outside the checklist
  // for this applicant capacity (for example a company letter on an individual draft).
  const checklist = documentChecklistRows(capacity, documents);
  const allowedCategories = new Set(checklist.map((row) => row.category));
  const unexpectedActive = documents.some((document) =>
    !document.supersededAt && !allowedCategories.has(document.category));
  const pendingScanCategories: SupportingDocumentCategory[] = [];
  for (const row of checklist) {
    // Optional documents may be absent, but an uploaded unsafe or rejected
    // optional document must never be silently accepted at submission.
    if (row.applicability === "IF_AVAILABLE" && row.state === "MISSING") continue;
    // Exactly one active version per category is allowed. Older versions must
    // be superseded; otherwise a clean newest file could mask an unsafe one.
    const active = documents.filter((d) => d.category === row.category && !d.supersededAt);
    const invalidVersions = active.some((d) => !Number.isSafeInteger(d.version) || d.version < 1);
    if (invalidVersions || active.length > 1) {
      blockingCategories.push(row.category as SupportingDocumentCategory);
      continue;
    }
    if (row.state === "PENDING_SCAN") pendingScanCategories.push(row.category as SupportingDocumentCategory);
    if (row.state !== "PENDING_REVIEW" && row.state !== "VERIFIED")
      blockingCategories.push(row.category as SupportingDocumentCategory);
  }
  return {
    ready: blockingCategories.length === 0 && !unexpectedActive,
    blockingCategories,
    pendingScanCategories,
    unexpectedActiveDocuments: unexpectedActive,
  };
}
