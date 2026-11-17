import { preliminaryDocumentChecklist } from "./supporting-documents.js";

export type DocumentUploadPolicy = {
  category: string;
  label: string;
  mimeTypes: string[];
  defaultMaxMiB: number;
  hardCeilingMiB: number;
};

/** Validate policy data received from the API before rendering upload guidance. */
export function isDocumentUploadPolicy(value: unknown): value is DocumentUploadPolicy {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return typeof row.category === "string" && row.category.trim().length > 0 && row.category === row.category.trim()
    && typeof row.label === "string" && row.label.trim().length > 0
    && Array.isArray(row.mimeTypes) && row.mimeTypes.length > 0
    && row.mimeTypes.every((mime: unknown) => typeof mime === "string" && mime.trim().length > 0)
    && typeof row.defaultMaxMiB === "number" && Number.isFinite(row.defaultMaxMiB) && row.defaultMaxMiB > 0
    && typeof row.hardCeilingMiB === "number" && Number.isFinite(row.hardCeilingMiB)
    && row.hardCeilingMiB >= row.defaultMaxMiB;
}

/** Omit ambiguous policy categories rather than choosing an arbitrary duplicate. */
export function unambiguousDocumentUploadPolicies(value: unknown): DocumentUploadPolicy[] {
  if (!Array.isArray(value)) return [];
  const counts = new Map<string, number>();
  // Count even malformed entries with a category so that an invalid duplicate
  // cannot silently leave a seemingly authoritative policy behind.
  for (const item of value) {
    if (typeof item !== "object" || item === null || Array.isArray(item)) continue;
    const category = (item as Record<string, unknown>).category;
    if (typeof category !== "string" || category.trim().length === 0) continue;
    const key = category.trim();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return value.filter((item): item is DocumentUploadPolicy =>
    isDocumentUploadPolicy(item) && counts.get(item.category.trim()) === 1
  );
}

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
  return typeof record.category === "string" && record.category.trim().length > 0 && record.category === record.category.trim()
    && Number.isSafeInteger(record.version) && (record.version as number) > 0
    && typeof record.fileName === "string" && record.fileName.trim().length > 0
    && typeof record.scanStatus === "string" && record.scanStatus.trim().length > 0
    && typeof record.verificationStatus === "string" && record.verificationStatus.trim().length > 0
    && (record.supersededAt === null || typeof record.supersededAt === "string");
}
export type DocumentApiRecord = DocumentStatusRecord & {
  uploadedAt: string;
  byteSize: number;
  mimeType: string;
};

/** Require a real, timezone-qualified ISO timestamp from the API. */
function isIsoTimestamp(value: unknown): value is string {
  if (typeof value !== "string" || !/^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d{1,3})?(?:Z|[+-]\\d{2}:\\d{2})$/.test(value)) return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed);
}

/** Validate document metadata as well as scan and officer status. */
export function isDocumentApiRecord(value: unknown): value is DocumentApiRecord {
  if (!isDocumentStatusRecord(value)) return false;
  const record = value as unknown as Record<string, unknown>;
  return isIsoTimestamp(record.uploadedAt)
    && typeof record.byteSize === "number" && Number.isSafeInteger(record.byteSize) && record.byteSize > 0
    && typeof record.mimeType === "string" && /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/.test(record.mimeType);
}

/** Parse the documents endpoint as untrusted data before showing any status. */
export function validatedDocumentResponse(value: unknown): {
  documents: DocumentApiRecord[];
  uploadPolicy: DocumentUploadPolicy[];
} | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const response = value as Record<string, unknown>;
  if (!Array.isArray(response.documents) || !response.documents.every(isDocumentApiRecord)) return null;
  if (!Array.isArray(response.uploadPolicy)) return null;
  // Feature flags must be explicit. Never infer permission to upload or submit.
  if (typeof response.uploadEnabled !== "boolean" || typeof response.submissionEnabled !== "boolean") return null;
  return {
    documents: response.documents,
    uploadPolicy: unambiguousDocumentUploadPolicies(response.uploadPolicy),
  };
}

export type DocumentChecklistRow = {
  category: string;
  label: string;
  applicability: string;
  note: string;
  current: DocumentStatusRecord | null;
  state: "MISSING" | "PENDING_SCAN" | "CONFLICT" | "UNSAFE" | "PENDING_REVIEW" | "REJECTED" | "VERIFIED";
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
      if (conflictingActiveVersions) state = "CONFLICT";
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
  CONFLICT: "Konflik versi dokumen aktif — perlu semakan pegawai",
  UNSAFE: "Tidak selamat / imbasan gagal",
  PENDING_REVIEW: "Menunggu pengesahan pegawai",
  REJECTED: "Ditolak pegawai",
  VERIFIED: "Disahkan pegawai",
};

/** Read-only next-step guidance; never implies that submission is enabled. */
export const documentNextStepLabels: Record<DocumentChecklistRow["state"], string> = {
  MISSING: "Sediakan dokumen jika berkaitan; semak keperluan rasmi dengan MBSP",
  PENDING_SCAN: "Tunggu keputusan imbasan keselamatan",
  CONFLICT: "Hubungi pegawai untuk menyelesaikan konflik versi aktif",
  UNSAFE: "Hubungi pegawai; dokumen tidak boleh dianggap selamat",
  PENDING_REVIEW: "Tunggu semakan dan pengesahan pegawai",
  REJECTED: "Semak sebab penolakan dengan pegawai sebelum menyediakan pembetulan",
  VERIFIED: "Tiada tindakan bagi rekod ini; tertakluk kepada semakan permohonan keseluruhan",
};
