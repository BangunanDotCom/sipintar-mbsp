import { preliminaryDocumentChecklist } from "./supporting-documents.js";

export type DocumentStatusRecord = {
  category: string;
  version: number;
  fileName: string;
  scanStatus: string;
  verificationStatus: string;
  supersededAt: string | null;
};
export type DocumentChecklistRow = {
  category: string;
  label: string;
  applicability: string;
  note: string;
  current: DocumentStatusRecord | null;
  state: "MISSING" | "PENDING_SCAN" | "UNSAFE" | "PENDING_REVIEW" | "REJECTED" | "VERIFIED";
};
export function documentChecklistRows(
  capacity: "INDIVIDUAL" | "COMPANY",
  documents: readonly DocumentStatusRecord[],
): DocumentChecklistRow[] {
  return preliminaryDocumentChecklist(capacity).map((requirement) => {
    const current = documents
      .filter((d) => d.category === requirement.category && !d.supersededAt)
      .sort((a, b) => b.version - a.version)[0] ?? null;
    let state: DocumentChecklistRow["state"] = "MISSING";
    if (current) {
      if (current.scanStatus === "INFECTED" || current.scanStatus === "FAILED")
        state = "UNSAFE";
      else if (current.scanStatus !== "CLEAN") state = "PENDING_SCAN";
      else if (current.verificationStatus === "REJECTED") state = "REJECTED";
      else if (current.verificationStatus === "VERIFIED") state = "VERIFIED";
      else state = "PENDING_REVIEW";
    }
    return { ...requirement, current, state };
  });
}
export const documentStatusLabels: Record<DocumentChecklistRow["state"], string> = {
  MISSING: "Tiada rekod dokumen",
  PENDING_SCAN: "Menunggu imbasan keselamatan",
  UNSAFE: "Tidak selamat / imbasan gagal",
  PENDING_REVIEW: "Menunggu pengesahan pegawai",
  REJECTED: "Ditolak pegawai",
  VERIFIED: "Disahkan pegawai",
};
