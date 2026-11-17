import { preliminaryDocumentChecklist } from "./supporting-documents.js";

export type DocumentStatusRecord = {
  category: string;
  version: number;
  fileName: string;
  scanStatus: string;
  verificationStatus: string;
  supersededAt: string | null;
};
/** Reject malformed API records rather than allowing them to appear verified. */
export function isDocumentStatusRecord(value: unknown): value is DocumentStatusRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return typeof record.category === "string"
    && Number.isSafeInteger(record.version) && (record.version as number) > 0
    && typeof record.fileName === "string"
    && typeof record.scanStatus === "string"
    && typeof record.verificationStatus === "string"
    && (record.supersededAt === null || typeof record.supersededAt === "string");
}
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
    const active = documents
      .filter((d) => d.category === requirement.category && d.supersededAt === null && Number.isSafeInteger(d.version) && d.version > 0)
      .sort((a, b) => b.version - a.version);
    const current = active[0] ?? null;
    // Only one active version per category is valid. Any conflicting active
    // records (including different versions) must never appear verified.
    const conflictingActiveVersions = active.length > 1;
    let state: DocumentChecklistRow["state"] = "MISSING";
    if (current) {
      if (conflictingActiveVersions) state = "UNSAFE";
      else if (current.scanStatus === "INFECTED" || current.scanStatus === "FAILED")
        state = "UNSAFE";
      else if (current.scanStatus === "PENDING" || current.scanStatus === "SCANNING") state = "PENDING_SCAN";
      else if (current.scanStatus !== "CLEAN") state = "UNSAFE";
      else if (current.verificationStatus === "REJECTED") state = "REJECTED";
      else if (current.verificationStatus === "VERIFIED") state = "VERIFIED";
      else if (current.verificationStatus === "UNVERIFIED") state = "PENDING_REVIEW";
      else state = "UNSAFE"; // Unknown status must not be treated as pending approval.
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
