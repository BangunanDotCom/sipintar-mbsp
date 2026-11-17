import { z } from "zod";

// Preliminary checklist only. Actual upload, document verification and
// mandatory submission gates must be implemented separately.
export const supportingDocumentCategorySchema = z.enum([
  "premises_plan",
  "floor_layout",
  "ownership_or_tenancy",
  "building_certificate",
  "fire_safety",
  "company_authority",
  "premises_photos",
]);
export type SupportingDocumentCategory = z.infer<typeof supportingDocumentCategorySchema>;
export type SupportingDocumentRequirement = {
  category: SupportingDocumentCategory;
  label: string;
  applicability: "ALL" | "COMPANY" | "IF_AVAILABLE";
  note: string;
};
export const preliminarySupportingDocuments: readonly SupportingDocumentRequirement[] = [
  { category: "premises_plan", label: "Pelan lokasi dan premis", applicability: "ALL", note: "Pelan yang menunjukkan kedudukan premis" },
  { category: "floor_layout", label: "Pelan susun atur setiap tingkat", applicability: "ALL", note: "Tunjukkan bilik, katil, kemudahan dan laluan keluar" },
  { category: "ownership_or_tenancy", label: "Bukti pemilikan atau kebenaran penggunaan premis", applicability: "ALL", note: "Dokumen berkaitan hak penggunaan premis" },
  { category: "building_certificate", label: "CCC / CFO / OC", applicability: "IF_AVAILABLE", note: "Tertakluk kepada status sijil bangunan" },
  { category: "fire_safety", label: "Dokumen sokongan keselamatan kebakaran", applicability: "IF_AVAILABLE", note: "Mengikut keperluan teknikal yang akan dimuktamadkan" },
  { category: "company_authority", label: "Surat kuasa wakil syarikat", applicability: "COMPANY", note: "Untuk permohonan atas nama syarikat" },
  { category: "premises_photos", label: "Gambar keadaan semasa premis", applicability: "ALL", note: "Gambar luar dan ruang dalaman berkaitan" },
];
export function preliminaryDocumentChecklist(capacity: "INDIVIDUAL" | "COMPANY") {
  return preliminarySupportingDocuments.filter((item) =>
    item.applicability !== "COMPANY" || capacity === "COMPANY");
}
