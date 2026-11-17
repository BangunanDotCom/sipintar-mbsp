/** Upload policy shared by the applicant portal and protected API routes.
 * The administrator can lower or raise the active delegation PDF limit,
 * but cannot bypass the hard safety ceiling for JSON/Base64 transport.
 */
export const DELEGATION_DEFAULT_MIB = 10;
export const DELEGATION_MAX_MIB = 20;
export function delegationLimitMiB(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) ||
      value < 1 || value > DELEGATION_MAX_MIB) return DELEGATION_DEFAULT_MIB;
  return value;
}
export function validateDelegationPdf(encoded: string, maxMiB: number): Buffer {
  // Strict Base64 canonical form: reject malformed padding and truncated payloads.
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded))
    throw new Error("Pengekodan dokumen tidak sah.");
  const bytes = Math.floor(encoded.length * 3 / 4) -
    (encoded.endsWith("==") ? 1 : 0) -
    (encoded.endsWith("=") ? 1 : 0);
  if (bytes > maxMiB * 1024 * 1024)
    throw new Error(`Saiz PDF melebihi had ${maxMiB} MiB.`);
  const buffer = Buffer.from(encoded, "base64");
  if (buffer.length < 8 || buffer.subarray(0, 5).toString("ascii") !== "%PDF-")
    throw new Error("Fail bukan dokumen PDF yang sah.");
  // A simple signature check does not replace malware scanning or PDF sanitization.
  return buffer;
}
