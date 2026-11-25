import { createHash, timingSafeEqual } from "node:crypto";
import type { CompanyRepresentative, Prisma } from "@prisma/client";
import { fail } from "./auth.js";

export const delegationMetadata = {
  id: true,
  companyId: true,
  representativeId: true,
  version: true,
  fileName: true,
  mimeType: true,
  uploadedBy: true,
  sha256: true,
  byteSize: true,
  authorityType: true,
  validFrom: true,
  validUntil: true,
  supersededAt: true,
  revokedAt: true,
  scanStatus: true,
  scanSha256: true,
  scanEngine: true,
  scanValidUntil: true,
  scanLeaseToken: true,
  scanLeaseExpiresAt: true,
} satisfies Prisma.DelegationDocumentSelect;
export type DelegationMetadata = Prisma.DelegationDocumentGetPayload<{
  select: typeof delegationMetadata;
}>;
export const delegationDigest = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");

export function isCurrentDelegation(doc: DelegationMetadata, now: Date) {
  return Boolean(
    doc.representativeId &&
    doc.version &&
    doc.validFrom &&
    doc.validFrom <= now &&
    (!doc.validUntil || doc.validUntil > now) &&
    !doc.supersededAt &&
    !doc.revokedAt &&
    doc.mimeType === "application/pdf" &&
    doc.byteSize &&
    /^[a-f0-9]{64}$/.test(doc.sha256),
  );
}

export function cleanDelegation(doc: DelegationMetadata, now: Date) {
  return (
    isCurrentDelegation(doc, now) &&
    doc.scanStatus === "CLEAN" &&
    doc.scanSha256 === doc.sha256 &&
    Boolean(doc.scanEngine?.trim()) &&
    Boolean(doc.scanValidUntil && doc.scanValidUntil > now) &&
    doc.scanLeaseToken === null &&
    doc.scanLeaseExpiresAt === null
  );
}

export function matchesDelegationBytes(
  doc: DelegationMetadata,
  bytes: Uint8Array,
) {
  return (
    doc.byteSize === bytes.byteLength &&
    /^[a-f0-9]{64}$/.test(doc.sha256) &&
    timingSafeEqual(
      Buffer.from(doc.sha256, "hex"),
      Buffer.from(delegationDigest(bytes), "hex"),
    )
  );
}

export async function lockedDelegation(
  tx: Prisma.TransactionClient,
  id: string,
) {
  await tx.$queryRaw`SELECT id FROM delegation_documents WHERE id = ${id} FOR SHARE`;
  return tx.delegationDocument.findUnique({
    where: { id },
    select: delegationMetadata,
  });
}

export async function delegationBytes(
  tx: Prisma.TransactionClient,
  doc: DelegationMetadata,
) {
  if (!cleanDelegation(doc, new Date())) fail(404, "Dokumen tidak ditemui.");
  const row = await tx.delegationDocument.findUnique({
    where: { id: doc.id },
    select: { content: true },
  });
  if (
    !row ||
    !matchesDelegationBytes(doc, row.content) ||
    !cleanDelegation(doc, new Date())
  )
    fail(404, "Dokumen tidak ditemui.");
  return Buffer.from(row.content);
}

// Membership alone is enough for saving drafts. Submission requires a live proof.
export async function verifiedDelegation(
  tx: Prisma.TransactionClient,
  rep: CompanyRepresentative,
) {
  if (rep.status !== "VERIFIED" || !rep.verifiedDocumentId)
    fail(409, "Surat kuasa versi semasa belum disahkan.");
  const doc = await lockedDelegation(tx, rep.verifiedDocumentId);
  if (
    !doc ||
    doc.representativeId !== rep.id ||
    doc.companyId !== rep.companyId ||
    doc.authorityType !== rep.authorityType ||
    !cleanDelegation(doc, new Date())
  )
    fail(409, "Surat kuasa versi semasa belum disahkan.");
  try {
    await delegationBytes(tx, doc);
  } catch {
    fail(409, "Surat kuasa versi semasa belum dapat disahkan.");
  }
  return { id: doc.id, version: doc.version, sha256: doc.sha256 };
}

export function delegationSummary(doc: DelegationMetadata, now = new Date()) {
  return {
    id: doc.id,
    fileName: doc.fileName,
    representativeId: doc.representativeId,
    version: doc.version,
    validUntil: doc.validUntil,
    scanStatus: doc.scanStatus,
    downloadable: cleanDelegation(doc, now),
  };
}
