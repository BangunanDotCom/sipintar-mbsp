import { UPLOAD_CATEGORIES, type UploadCategory } from "./upload-policy.js";
import { matchesDeclaredFileSignature } from "./document-file-signatures.js";

export type DraftUploadKind = Exclude<UploadCategory, "delegation">;
export type ValidatedDraftUpload = {
  bytes: Buffer;
  mimeType: "application/pdf" | "image/jpeg" | "image/png";
  sha256Input: Buffer;
};

function base64ByteLength(encoded: string): number {
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded))
    throw new Error("Pengekodan fail tidak sah.");
  return (encoded.length / 4) * 3 -
    (encoded.endsWith("==") ? 2 : encoded.endsWith("=") ? 1 : 0);
}
export function validateDraftUpload(
  encoded: string,
  category: DraftUploadKind,
  claimedMime: string,
  maxMiB: number,
): ValidatedDraftUpload {
  const policy = UPLOAD_CATEGORIES[category];
  if (!policy || !Number.isInteger(maxMiB) || maxMiB < 1 || maxMiB > policy.ceilingMiB)
    throw new Error("Had atau kategori muat naik tidak sah.");
  if (encoded.length > Math.ceil((maxMiB * 1024 * 1024) / 3) * 4 + 4)
    throw new Error("Fail melebihi had saiz.");
  const length = base64ByteLength(encoded);
  if (length === 0 || length > maxMiB * 1024 * 1024)
    throw new Error("Fail kosong atau melebihi had saiz.");
  const bytes = Buffer.from(encoded, "base64");
  if (bytes.length !== length) throw new Error("Pengekodan fail tidak konsisten.");
  const detected = (["application/pdf", "image/jpeg", "image/png"] as const)
    .find((mime) => matchesDeclaredFileSignature(bytes, mime));
  if (!detected || detected !== claimedMime || !policy.mime.split(",").includes(detected))
    throw new Error("Jenis fail tidak sepadan dengan kandungan yang dibenarkan.");
  // Signatures do not prove safety. Scanning, isolation, permissions and
  // private object storage are required before enabling upload routes.
  return { bytes, mimeType: detected, sha256Input: bytes };
}
