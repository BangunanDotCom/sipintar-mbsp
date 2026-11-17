import { preliminaryDocumentChecklist, type SupportingDocumentCategory } from "../../../packages/shared/src/supporting-documents.js";
import { UPLOAD_CATEGORIES, type UploadCategory } from "./upload-policy.js";

export type DraftDocumentUploadPolicy = {
  category: SupportingDocumentCategory;
  label: string;
  mimeTypes: string[];
  defaultMaxMiB: number;
  hardCeilingMiB: number;
};

// Metadata only. Do not use this helper to authorize an upload or bypass server limits.
export function draftDocumentUploadPolicy(capacity: "INDIVIDUAL" | "COMPANY"): DraftDocumentUploadPolicy[] {
  return preliminaryDocumentChecklist(capacity).map((row) => {
    const kind: UploadCategory = row.category === "premises_photos" ? "photo"
      : row.category === "premises_plan" || row.category === "floor_layout" ? "plan"
      : "supporting";
    const policy = UPLOAD_CATEGORIES[kind];
    return {
      category: row.category,
      label: row.label,
      mimeTypes: policy.mime.split(","),
      defaultMaxMiB: policy.defaultMiB,
      hardCeilingMiB: policy.ceilingMiB,
    };
  });
}
