import { matchesDeclaredFileSignature } from "./document-file-signatures.js";

/** Central upload policy. Values are MiB and may be configured by ICT admin.
 * Hard ceilings are transport/security limits, not MBSP operational approvals.
 */
export const UPLOAD_CATEGORIES = {
  delegation: { key: "upload_delegation_mib", defaultMiB: 10, ceilingMiB: 20, mime: "application/pdf" },
  supporting: { key: "upload_supporting_mib", defaultMiB: 20, ceilingMiB: 50, mime: "application/pdf" },
  plan: { key: "upload_plan_mib", defaultMiB: 50, ceilingMiB: 100, mime: "application/pdf" },
  photo: { key: "upload_photo_mib", defaultMiB: 10, ceilingMiB: 20, mime: "image/jpeg,image/png" },
} as const;
export type UploadCategory = keyof typeof UPLOAD_CATEGORIES;
export function uploadLimitMiB(category: UploadCategory, value: unknown): number {
  const policy = UPLOAD_CATEGORIES[category];
  return typeof value === "number" && Number.isInteger(value) &&
    value >= 1 && value <= policy.ceilingMiB ? value : policy.defaultMiB;
}
export function uploadPolicyKey(category: UploadCategory): string {
  return "technical." + UPLOAD_CATEGORIES[category].key;
}
export function uploadCategoryForKey(key: string): UploadCategory | undefined {
  return (Object.keys(UPLOAD_CATEGORIES) as UploadCategory[]).find(
    (category) => UPLOAD_CATEGORIES[category].key === key,
  );
}
// Compatibility for the existing company-delegation upload route.
export const DELEGATION_DEFAULT_MIB = UPLOAD_CATEGORIES.delegation.defaultMiB;
export const DELEGATION_MAX_MIB = UPLOAD_CATEGORIES.delegation.ceilingMiB;
export function delegationLimitMiB(value: unknown): number {
  return uploadLimitMiB("delegation", value);
}
export function validateDelegationPdf(encoded: string, maxMiB: number): Buffer {
  if (!Number.isInteger(maxMiB) || maxMiB < 1 || maxMiB > DELEGATION_MAX_MIB)
    throw new Error("Had saiz dokumen tidak sah.");
  if (encoded.length > Math.ceil(maxMiB * 1024 * 1024 / 3) * 4 + 4)
    throw new Error(`Saiz PDF melebihi had ${maxMiB} MiB.`);
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded))
    throw new Error("Pengekodan dokumen tidak sah.");
  const length = (encoded.length / 4) * 3 -
    (encoded.endsWith("==") ? 2 : encoded.endsWith("=") ? 1 : 0);
  if (length < 1 || length > maxMiB * 1024 * 1024)
    throw new Error(`Saiz PDF melebihi had ${maxMiB} MiB.`);
  const buffer = Buffer.from(encoded, "base64");
  if (buffer.length !== length || buffer.toString("base64") !== encoded)
    throw new Error("Pengekodan dokumen tidak kanonik.");
  if (!matchesDeclaredFileSignature(buffer, "application/pdf"))
    throw new Error("Fail bukan dokumen PDF yang sah.");
  // Signature alone does not establish PDF safety; malware scanning is still required.
  return buffer;
}
