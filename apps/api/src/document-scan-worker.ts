import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { scanQuarantinedDocument, type DocumentMalwareScanner } from "./document-malware-scanner.js";
import type { PrivateDocumentStore } from "./private-document-store.js";

// Worker-only: acquire a unique expiring lease before scanning.
// Expired leases can be reclaimed; stale workers cannot overwrite newer results.
export async function processPendingDocumentScan(
  db: PrismaClient,
  store: PrivateDocumentStore,
  scanner: DocumentMalwareScanner,
  documentId: string,
): Promise<"CLEAN" | "INFECTED" | "FAILED" | "SKIPPED"> {
  const document = await db.applicationDocument.findUnique({
    where: { id: documentId },
    select: {
      id: true, draftId: true, storageKey: true, sha256: true,
      scanStatus: true, supersededAt: true,
    },
  });
  if (!document || document.supersededAt ||
      !["PENDING", "SCANNING"].includes(document.scanStatus)) return "SKIPPED";
  const token = randomUUID();
  const now = new Date();
  const claimed = await db.applicationDocument.updateMany({
    where: {
      id: document.id, draftId: document.draftId,
      storageKey: document.storageKey, sha256: document.sha256,
      supersededAt: null,
      OR: [
        { scanStatus: "PENDING" },
        { scanStatus: "SCANNING", scanLeaseExpiresAt: { lt: now } },
      ],
    },
    data: {
      scanStatus: "SCANNING",
      scanLeaseToken: token,
      scanLeaseExpiresAt: new Date(now.getTime() + 5 * 60 * 1000),
    },
  });
  if (claimed.count !== 1) return "SKIPPED";
  let status: "CLEAN" | "INFECTED" | "FAILED" = "FAILED";
  try {
    const result = await scanQuarantinedDocument(store, scanner, {
      draftId: document.draftId,
      storageKey: document.storageKey,
      expectedSha256: document.sha256,
    });
    status = result.status;
  } catch {
    status = "FAILED";
  }
  const updated = await db.applicationDocument.updateMany({
    where: {
      id: document.id, draftId: document.draftId,
      storageKey: document.storageKey, sha256: document.sha256,
      scanStatus: "SCANNING", scanLeaseToken: token,
      scanLeaseExpiresAt: { gte: new Date() }, supersededAt: null,
    },
    data: { scanStatus: status, scanLeaseToken: null, scanLeaseExpiresAt: null },
  });
  return updated.count === 1 ? status : "SKIPPED";
}
