import type { PrismaClient } from "@prisma/client";
import { scanQuarantinedDocument, type DocumentMalwareScanner } from "./document-malware-scanner.js";
import type { PrivateDocumentStore } from "./private-document-store.js";

// Worker-only service. Do not expose as an applicant route.
// Compare-and-set protects newer document versions and concurrent scan workers.
export async function processPendingDocumentScan(
  db: PrismaClient,
  store: PrivateDocumentStore,
  scanner: DocumentMalwareScanner,
  documentId: string,
): Promise<"CLEAN" | "INFECTED" | "FAILED" | "SKIPPED"> {
  const document = await db.applicationDocument.findUnique({
    where: { id: documentId },
    select: { id: true, draftId: true, storageKey: true, sha256: true, scanStatus: true, supersededAt: true },
  });
  if (!document || document.scanStatus !== "PENDING" || document.supersededAt)
    return "SKIPPED";
  let status: "CLEAN" | "INFECTED" | "FAILED" = "FAILED";
  try {
    const result = await scanQuarantinedDocument(store, scanner, {
      draftId: document.draftId,
      storageKey: document.storageKey,
      expectedSha256: document.sha256,
    });
    status = result.status;
  } catch {
    // A storage, integrity, scanner or network failure must never become CLEAN.
    status = "FAILED";
  }
  const updated = await db.applicationDocument.updateMany({
    where: {
      id: document.id,
      draftId: document.draftId,
      storageKey: document.storageKey,
      sha256: document.sha256,
      scanStatus: "PENDING",
      supersededAt: null,
    },
    data: { scanStatus: status },
  });
  return updated.count === 1 ? status : "SKIPPED";
}
