import {
  documentChecklistRows,
  type DocumentStatusRecord,
} from "../../../packages/shared/src/document-checklist-status.js";
import type { SupportingDocumentCategory } from "../../../packages/shared/src/supporting-documents.js";

export type DocumentSubmissionReadiness = {
  ready: boolean;
  blockingCategories: SupportingDocumentCategory[];
  pendingScanCategories: SupportingDocumentCategory[];
};

// Only mandatory categories block submission. Officer verification is a separate
// post-submission step; CLEAN + not REJECTED is sufficient for this preliminary gate.
// This is not a substitute for authorization, declaration or server-side transaction checks.
export function documentSubmissionReadiness(
  capacity: "INDIVIDUAL" | "COMPANY",
  documents: readonly DocumentStatusRecord[],
): DocumentSubmissionReadiness {
  const blockingCategories: SupportingDocumentCategory[] = [];
  const pendingScanCategories: SupportingDocumentCategory[] = [];
  for (const row of documentChecklistRows(capacity, documents)) {
    if (row.applicability === "IF_AVAILABLE") continue;
    // Reject ambiguous active versions rather than selecting an arbitrary record.
    // A corrupt/duplicated active version must never satisfy a submission gate.
    const active = documents.filter((d) => d.category === row.category && !d.supersededAt);
    const versions = new Set(active.map((d) => d.version));
    const invalidVersions = active.some((d) => !Number.isSafeInteger(d.version) || d.version < 1);
    if (invalidVersions || versions.size !== active.length) {
      blockingCategories.push(row.category as SupportingDocumentCategory);
      continue;
    }
    if (row.state === "PENDING_SCAN") pendingScanCategories.push(row.category as SupportingDocumentCategory);
    if (row.state !== "PENDING_REVIEW" && row.state !== "VERIFIED")
      blockingCategories.push(row.category as SupportingDocumentCategory);
  }
  return {
    ready: blockingCategories.length === 0,
    blockingCategories,
    pendingScanCategories,
  };
}
