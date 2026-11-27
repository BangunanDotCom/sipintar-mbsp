import { createHash, timingSafeEqual } from "node:crypto";
import type { CompanyRepresentative, Prisma } from "@prisma/client";
import { isCurrent } from "../../../packages/shared/src/index.js";
import { type session, fail } from "./auth.js";

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
  lock = true,
) {
  if (lock)
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
export async function lockedVerifiedDelegation(
  tx: Prisma.TransactionClient,
  rep: CompanyRepresentative,
  lock = true,
) {
  if (rep.status !== "VERIFIED" || !rep.verifiedDocumentId)
    fail(409, "Surat kuasa versi semasa belum disahkan.");
  const doc = await lockedDelegation(tx, rep.verifiedDocumentId, lock);
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
  return doc;
}

export async function verifiedDelegation(
  tx: Prisma.TransactionClient,
  rep: CompanyRepresentative,
  lock = true,
) {
  const { id, version, sha256 } = await lockedVerifiedDelegation(tx, rep, lock);
  return { id, version, sha256 };
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

export async function principalAtUse(
  tx: Prisma.TransactionClient,
  observed: Pick<
    Awaited<ReturnType<typeof session>>,
    "userId" | "id" | "activeRole" | "csrfHash"
  >,
  mode: "PIC" | "COMPANY",
) {
  await tx.$queryRaw`SELECT id FROM users WHERE id = ${observed.userId} FOR SHARE`;
  await tx.$queryRaw`SELECT id FROM user_role_assignments WHERE "userId" = ${observed.userId} AND "roleId" = ${observed.activeRole} ORDER BY id FOR SHARE`;
  await tx.$queryRaw`SELECT id FROM sessions WHERE id = ${observed.id} FOR SHARE`;
  const current = await tx.session.findFirst({
    where: {
      id: observed.id,
      userId: observed.userId,
      activeRole: observed.activeRole,
      csrfHash: observed.csrfHash,
      expiresAt: { gt: new Date() },
      user: {
        kind: mode === "PIC" ? "OFFICER" : "APPLICANT",
        status: "ACTIVE",
        emailVerified: true,
      },
      ...(mode === "PIC" && { mfaVerified: true, activeRole: "PIC_KAWASAN" }),
    },
    include: {
      user: {
        include: {
          roles: { include: { role: { include: { permissions: true } } } },
        },
      },
    },
  });
  if (
    !current ||
    !current.user.roles.some(
      (role) =>
        role.roleId === current.activeRole &&
        isCurrent(role) &&
        (mode === "COMPANY" || role.districtId === null) &&
        role.role.permissions.some(
          (p) =>
            p.action ===
            (mode === "PIC" ? "representation.verify" : "companies"),
        ),
    )
  )
    fail(403, "Skop sesi tidak sah untuk surat kuasa.");
}

export async function currentDelegationSummaries(
  tx: Prisma.TransactionClient,
  reps: Pick<CompanyRepresentative, "id" | "companyId" | "authorityType">[],
  now: Date,
) {
  const docs = await tx.delegationDocument.findMany({
    where: {
      OR: reps.map((rep) => ({
        representativeId: rep.id,
        companyId: rep.companyId,
        authorityType: rep.authorityType,
      })),
      version: { gt: 0 },
      validFrom: { lte: now },
      supersededAt: null,
      revokedAt: null,
      AND: [{ OR: [{ validUntil: null }, { validUntil: { gt: now } }] }],
    },
    select: delegationMetadata,
  });
  const summaries = new Map<string, ReturnType<typeof delegationSummary>[]>();
  for (const doc of docs) {
    if (doc.representativeId && isCurrentDelegation(doc, now))
      summaries.set(doc.representativeId, [delegationSummary(doc, now)]);
  }
  return summaries;
}

export async function companyDelegationViews(
  tx: Prisma.TransactionClient,
  userId: string,
  includeDocuments: boolean,
) {
  const now = new Date();
  const reps = await tx.companyRepresentative.findMany({
    where: {
      userId,
      company: { status: "ACTIVE" },
      status: { not: "REVOKED" },
      startsAt: { lte: now },
      OR: [{ endsAt: null }, { endsAt: { gt: now } }],
    },
    include: { company: true },
  });
  const summaries = await currentDelegationSummaries(tx, reps, now);
  return reps.map(({ verifiedDocumentId, ...rep }) => {
    const documents = summaries.get(rep.id) ?? [];
    const status =
      rep.status === "VERIFIED" &&
      !documents.some(
        (doc) => doc.id === verifiedDocumentId && doc.downloadable,
      )
        ? "DOCUMENT_UPDATE_REQUIRED"
        : rep.status;
    return {
      ...rep,
      status,
      company: { ...rep.company, documents: includeDocuments ? documents : [] },
    };
  });
}
