import { validRepresentative } from "./company-invitations.js";
import { randomUUID } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import {
  delegationMetadata,
  isCurrentDelegation,
  matchesDelegationBytes,
} from "./delegation-evidence.js";
import type {
  DocumentMalwareScanner,
  MalwareScanResult,
} from "./document-malware-scanner.js";

async function hasLiveScope(
  db: Prisma.TransactionClient,
  id: string,
  companyId: string,
  authorityType: string | null,
  now: Date,
) {
  const rep = await db.companyRepresentative.findFirst({
    where: { id, companyId, company: { status: "ACTIVE" } },
  });
  return Boolean(
    rep && rep.authorityType === authorityType && validRepresentative(rep, now),
  );
}

export async function dueDelegationScans(db: PrismaClient, now: Date) {
  return db.$queryRaw<{ id: string }[]>`
    SELECT d.id FROM delegation_documents d
    JOIN company_representatives r ON r.id = d."representativeId"
      AND r."companyId" = d."companyId" AND r."authorityType" = d."authorityType"
    JOIN companies c ON c.id = d."companyId"
    WHERE c.status = 'ACTIVE' AND r.status <> 'REVOKED' AND r."startsAt" <= ${now}
      AND (r."endsAt" IS NULL OR r."endsAt" > ${now})
      AND d."validFrom" <= ${now} AND (d."validUntil" IS NULL OR d."validUntil" > ${now})
      AND d."supersededAt" IS NULL AND d."revokedAt" IS NULL
      AND (d."scanStatus" = 'PENDING'
        OR (d."scanStatus" = 'SCANNING' AND d."scanLeaseExpiresAt" <= ${now})
        OR (d."scanStatus" = 'CLEAN' AND d."scanValidUntil" <= ${now}))
    ORDER BY d."createdAt", d.id LIMIT 10`;
}

export async function scanDelegationDocument(
  db: PrismaClient,
  scanner: DocumentMalwareScanner,
  id: string,
  clock = () => new Date(),
) {
  const now = clock();
  const token = randomUUID();
  const doc = await db.delegationDocument.findUnique({
    where: { id },
    select: delegationMetadata,
  });
  if (
    !doc?.representativeId ||
    !isCurrentDelegation(doc, now) ||
    !(await hasLiveScope(
      db,
      doc.representativeId,
      doc.companyId,
      doc.authorityType,
      now,
    ))
  )
    return false;
  const representativeId = doc.representativeId;
  const current = {
    id,
    sha256: doc.sha256,
    supersededAt: null,
    revokedAt: null,
  };
  const claim = await db.delegationDocument.updateMany({
    where: {
      ...current,
      OR: [
        { scanStatus: "PENDING" },
        { scanStatus: "SCANNING", scanLeaseExpiresAt: { lte: now } },
        { scanStatus: "CLEAN", scanValidUntil: { lte: now } },
      ],
    },
    data: {
      scanStatus: "SCANNING",
      scanLeaseToken: token,
      scanLeaseExpiresAt: new Date(now.getTime() + 60_000),
      scanSha256: null,
      scanEngine: null,
      scanValidUntil: null,
    },
  });
  if (claim.count !== 1) return false;

  let outcome: MalwareScanResult = { status: "FAILED", engine: "scan-failed" };
  try {
    const row = await db.delegationDocument.findFirst({
      where: {
        ...current,
        scanLeaseToken: token,
        scanLeaseExpiresAt: { gt: clock() },
      },
      select: { content: true },
    });
    if (row && matchesDelegationBytes(doc, row.content)) {
      const result = await scanner.scan(Buffer.from(row.content));
      if (
        result &&
        ["CLEAN", "INFECTED", "FAILED"].includes(result.status) &&
        typeof result.engine === "string" &&
        /^[\x20-\x7e]{1,128}$/.test(result.engine) &&
        result.engine.trim()
      )
        outcome = { status: result.status, engine: result.engine.trim() };
    }
  } catch {
    // Persist a generic failure without disclosing scanner or storage internals.
  }

  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM company_representatives WHERE id = ${representativeId} FOR SHARE`;
    await tx.$queryRaw`SELECT id FROM companies WHERE id = ${doc.companyId} FOR SHARE`;
    const finished = clock();
    if (
      !(await hasLiveScope(
        tx,
        representativeId,
        doc.companyId,
        doc.authorityType,
        finished,
      ))
    )
      return false;
    const verdict = await tx.delegationDocument.updateMany({
      where: {
        ...current,
        scanStatus: "SCANNING",
        scanLeaseToken: token,
        scanLeaseExpiresAt: { gt: finished },
        OR: [{ validUntil: null }, { validUntil: { gt: finished } }],
      },
      data: {
        scanStatus: outcome.status,
        scanEngine: outcome.engine,
        scanSha256: outcome.status === "CLEAN" ? doc.sha256 : null,
        scanValidUntil:
          outcome.status === "CLEAN"
            ? new Date(finished.getTime() + 86_400_000)
            : null,
        scanLeaseToken: null,
        scanLeaseExpiresAt: null,
      },
    });
    return verdict.count === 1;
  });
}
