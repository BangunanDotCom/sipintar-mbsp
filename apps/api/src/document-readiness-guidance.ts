import type { DocumentSubmissionReadiness } from "./document-submission-readiness.js";
import {
  preliminaryDocumentChecklist,
  type SupportingDocumentCategory,
} from "../../../packages/shared/src/supporting-documents.js";

export type ReadinessGuidance = {
  headline: string;
  message: string;
  issues: Array<{ category: SupportingDocumentCategory; label: string; message: string }>;
  integrityWarning: string | null;
};

// Presentation-only hints. Never use this DTO to authorize actual submission.
export function documentReadinessGuidance(
  capacity: "INDIVIDUAL" | "COMPANY",
  readiness: DocumentSubmissionReadiness,
): ReadinessGuidance {
  const labels = new Map(preliminaryDocumentChecklist(capacity).map((item) => [item.category, item.label]));
  const pending = new Set(readiness.pendingScanCategories);
  const issues = readiness.blockingCategories.map((category) => ({
    category,
    label: labels.get(category) ?? "Dokumen sokongan",
    message: pending.has(category)
      ? "Imbasan keselamatan belum selesai. Sila semak semula kemudian."
      : "Dokumen belum lengkap atau memerlukan pembetulan. Sila semak senarai dokumen.",
  }));
  const integrityWarning = readiness.unexpectedActiveDocuments
    ? "Rekod dokumen tidak sepadan dengan jenis pemohon. Sila hubungi pentadbir sistem."
    : null;
  return {
    headline: readiness.ready ? "Semakan awal dokumen lengkap" : "Tindakan diperlukan pada dokumen",
    message: readiness.ready
      ? "Dokumen memenuhi semakan awal. Penghantaran rasmi masih belum dibuka."
      : "Sila selesaikan isu dokumen sebelum permohonan boleh dipertimbangkan untuk penghantaran.",
    issues,
    integrityWarning,
  };
}
