import { preliminaryDocumentChecklist, type SupportingDocumentCategory } from "../../../packages/shared/src/supporting-documents.js";
import { UPLOAD_CATEGORIES, type UploadCategory } from "./upload-policy.js";

export function uploadKindForSupportingDocument(category: SupportingDocumentCategory): Exclude<UploadCategory, "delegation"> {
  switch (category) {
    case "premises_photos": return "photo";
    case "premises_plan":
    case "floor_layout": return "plan";
    case "ownership_or_tenancy":
    case "building_certificate":
    case "fire_safety":
    case "company_authority": return "supporting";
  }
}

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
    const kind = uploadKindForSupportingDocument(row.category);
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
