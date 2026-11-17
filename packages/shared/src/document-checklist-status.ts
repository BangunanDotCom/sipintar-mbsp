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
    && row.mimeTypes.every((mime: unknown) => typeof mime === "string" && /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/.test(mime))
    && new Set(row.mimeTypes).size === row.mimeTypes.length
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
    && (record.supersededAt === null || isIsoTimestamp(record.supersededAt));
}
export type DocumentApiRecord = DocumentStatusRecord & {
  uploadedAt: string;
  byteSize: number;
  mimeType: string;
};

/** Require a real, timezone-qualified ISO timestamp from the API. */
function isIsoTimestamp(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!match) return false;
  const [, year, month, day, hour, minute, second, timezone] = match;
  const y = Number(year), m = Number(month), d = Number(day);
  const h = Number(hour), min = Number(minute), sec = Number(second);
  if (y < 1 || m < 1 || m > 12 || h > 23 || min > 59 || sec > 59) return false;
  const leapYear = y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (d < 1 || d > daysInMonth[m - 1]) return false;
  if (timezone !== "Z") {
    const offsetHours = Number(timezone.slice(1, 3));
    const offsetMinutes = Number(timezone.slice(4, 6));
    // ISO 8601 timezone offsets cannot exceed 14 hours.
    if (offsetHours > 14 || offsetMinutes > 59 || (offsetHours === 14 && offsetMinutes !== 0)) return false;
  }
  return Number.isFinite(Date.parse(value));
}

/** Validate document metadata as well as scan and officer status. */
export function isDocumentApiRecord(value: unknown): value is DocumentApiRecord {
  if (!isDocumentStatusRecord(value)) return false;
  const record = value as unknown as Record<string, unknown>;
  return isIsoTimestamp(record.uploadedAt)
    && (record.supersededAt === null || Date.parse(record.supersededAt as string) >= Date.parse(record.uploadedAt as string))
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
  // This read-only interface has no upload or submission workflow. Fail closed
  // if the API unexpectedly advertises either feature as enabled.
  if (response.uploadEnabled || response.submissionEnabled) return null;
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
    // A superseded version cannot be newer than the only active version.
    // Treat inconsistent version history as a conflict, never as verified.
    const newerSupersededVersion = current !== null && documents.some((d) =>
      d.category === requirement.category && d.supersededAt !== null
      && Number.isSafeInteger(d.version) && d.version >= current.version);
    const categoryVersions = documents
      .filter((d) => d.category === requirement.category && Number.isSafeInteger(d.version) && d.version > 0)
      .map((d) => d.version);
    // Duplicate historical version numbers make the audit trail ambiguous,
    // even if one of those records has already been superseded.
    const duplicateHistoricalVersions = new Set(categoryVersions).size !== categoryVersions.length;
    let state: DocumentChecklistRow["state"] = "MISSING";
    // A duplicate audit-history version is a conflict even when no active
    // document remains; do not misreport corrupted history as simply missing.
    if (duplicateHistoricalVersions) state = "CONFLICT";
    else if (current) {
      if (conflictingActiveVersions || newerSupersededVersion) state = "CONFLICT";
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
/** Advisory counts only: these never determine submission eligibility. */
export function documentChecklistSummary(rows: readonly DocumentChecklistRow[]) {
  const priority = rows.filter((row) => row.applicability === "ALL" || row.applicability === "COMPANY");
  return {
    total: priority.length,
    recorded: priority.filter((row) => row.current !== null).length,
    verified: priority.filter((row) => row.state === "VERIFIED").length,
    unsafe: priority.filter((row) => row.state === "UNSAFE").length,
    pendingScan: priority.filter((row) => row.state === "PENDING_SCAN").length,
    pendingScanRows: rows.filter((row) => row.state === "PENDING_SCAN"),
    conflicts: priority.filter((row) => row.state === "CONFLICT").length,
    pendingReview: priority.filter((row) => row.state === "PENDING_REVIEW").length,
    pendingReviewRows: priority.filter((row) => row.state === "PENDING_REVIEW"),
    rejected: priority.filter((row) => row.state === "REJECTED").length,
    attentionRows: priority.filter((row) => ["CONFLICT", "UNSAFE", "REJECTED"].includes(row.state)),
    missing: priority.filter((row) => row.state === "MISSING"),
    // Optional documents are visible for preparation but excluded from priority counts.
    optionalTotal: rows.filter((row) => row.applicability === "IF_AVAILABLE").length,
    optionalRecorded: rows.filter((row) => row.applicability === "IF_AVAILABLE" && row.current !== null).length,
    optionalAttention: rows.filter((row) => row.applicability === "IF_AVAILABLE" && ["UNSAFE", "CONFLICT", "REJECTED"].includes(row.state)).length,
    optionalAttentionRows: rows.filter((row) => row.applicability === "IF_AVAILABLE" && ["UNSAFE", "CONFLICT", "REJECTED"].includes(row.state)),
    optionalPendingReviewRows: rows.filter((row) => row.applicability === "IF_AVAILABLE" && row.state === "PENDING_REVIEW"),
  };
}

export const documentStatusLabels: Record<DocumentChecklistRow["state"], string> = {
  MISSING: "Tiada rekod dokumen",
  PENDING_SCAN: "Menunggu imbasan keselamatan",
  CONFLICT: "Konflik sejarah atau versi dokumen — perlu semakan pegawai",
  UNSAFE: "Tidak selamat / imbasan gagal",
  PENDING_REVIEW: "Menunggu pengesahan pegawai",
  REJECTED: "Ditolak pegawai",
  VERIFIED: "Disahkan pegawai",
};

/** Read-only next-step guidance; never implies that submission is enabled. */
export const documentNextStepLabels: Record<DocumentChecklistRow["state"], string> = {
  MISSING: "Sediakan dokumen jika berkaitan; semak keperluan rasmi dengan MBSP",
  PENDING_SCAN: "Tunggu keputusan imbasan keselamatan",
  CONFLICT: "Hubungi pegawai untuk menyelesaikan konflik sejarah atau versi dokumen",
  UNSAFE: "Hubungi pegawai; dokumen tidak boleh dianggap selamat",
  PENDING_REVIEW: "Tunggu semakan dan pengesahan pegawai",
  REJECTED: "Semak sebab penolakan dengan pegawai sebelum menyediakan pembetulan",
  VERIFIED: "Tiada tindakan bagi rekod ini; tertakluk kepada semakan permohonan keseluruhan",
};

/** Read-only display filtering; does not change document verification or submission eligibility. */
export type DocumentStatusFilter = "ALL" | "ATTENTION" | "PENDING" | "VERIFIED" | "MISSING";
export type DocumentScopeFilter = "ALL" | "PRIORITY" | "OPTIONAL";
export function filterDocumentChecklistRows(
  rows: readonly DocumentChecklistRow[],
  filter: DocumentStatusFilter,
  search = "",
  scope: DocumentScopeFilter = "ALL",
): DocumentChecklistRow[] {
  const term = search.trim().toLocaleLowerCase("ms-MY");
  return rows.filter((row) => {
    if (scope === "PRIORITY" && row.applicability === "IF_AVAILABLE") return false;
    if (scope === "OPTIONAL" && row.applicability !== "IF_AVAILABLE") return false;
    if (term && ![row.label, row.note, row.category].some((value) => value.toLocaleLowerCase("ms-MY").includes(term))) return false;
    switch (filter) {
      case "ATTENTION": return row.state === "CONFLICT" || row.state === "UNSAFE" || row.state === "REJECTED";
      case "PENDING": return row.state === "PENDING_SCAN" || row.state === "PENDING_REVIEW";
      case "VERIFIED": return row.state === "VERIFIED";
      case "MISSING": return row.state === "MISSING";
      default: return true;
    }
  });
}

/**
 * Read-only officer triage preview. Never grants access, changes verification,
 * or determines whether an application can be submitted.
 */
export type DocumentReviewQueueItem = {
  category: string;
  label: string;
  applicability: string;
  state: DocumentChecklistRow["state"];
  version: number | null;
  priority: "CRITICAL" | "ACTION" | "WAITING";
};
export function documentReviewQueue(rows: readonly DocumentChecklistRow[]): DocumentReviewQueueItem[] {
  const priorityByState: Partial<Record<DocumentChecklistRow["state"], DocumentReviewQueueItem["priority"]>> = {
    CONFLICT: "CRITICAL",
    UNSAFE: "CRITICAL",
    REJECTED: "ACTION",
    PENDING_REVIEW: "ACTION",
    PENDING_SCAN: "WAITING",
  };
  const rank = { CRITICAL: 0, ACTION: 1, WAITING: 2 };
  return rows.flatMap((row) => {
    const priority = priorityByState[row.state];
    return priority ? [{
      category: row.category,
      label: row.label,
      applicability: row.applicability,
      state: row.state,
      version: row.current?.version ?? null,
      priority,
    }] : [];
  }).sort((a, b) => rank[a.priority] - rank[b.priority]
    || a.category.localeCompare(b.category));
}

/** Queue summary for future authorized officer dashboards; read-only and advisory. */
export function documentReviewQueueSummary(queue: readonly DocumentReviewQueueItem[]) {
  return {
    total: queue.length,
    critical: queue.filter((item) => item.priority === "CRITICAL").length,
    action: queue.filter((item) => item.priority === "ACTION").length,
    waiting: queue.filter((item) => item.priority === "WAITING").length,
    main: queue.filter((item) => item.applicability !== "IF_AVAILABLE").length,
    optional: queue.filter((item) => item.applicability === "IF_AVAILABLE").length,
  };
}
