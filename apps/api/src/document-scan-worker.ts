import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import {
  documentScanRepository,
  type DocumentScanRepository,
} from "./document-scan-repository.js";
import {
  scanQuarantinedDocument,
  type DocumentMalwareScanner,
} from "./document-malware-scanner.js";
import type { PrivateDocumentStore } from "./private-document-store.js";

// Worker-only: acquire a unique expiring lease before scanning.
// Expired leases can be reclaimed; stale workers cannot overwrite newer results.
export async function processPendingDocumentScan(
  db: PrismaClient | DocumentScanRepository,
  store: PrivateDocumentStore,
  scanner: DocumentMalwareScanner,
  documentId: string,
): Promise<"CLEAN" | "INFECTED" | "FAILED" | "SKIPPED"> {
  // Fail closed on malformed worker queue identifiers before querying the database.
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      documentId,
    )
  )
    return "SKIPPED";
  const repository = documentScanRepository(db);
  const document = await repository.find(documentId);
  if (
    !document ||
    document.supersededAt ||
    !["PENDING", "SCANNING"].includes(document.scanStatus)
  )
    return "SKIPPED";
  const token = randomUUID();
  if (!(await repository.claim(document, token))) return "SKIPPED";
  let status: "CLEAN" | "INFECTED" | "FAILED" = "FAILED";
  try {
    const result = await scanQuarantinedDocument(store, scanner, {
      draftId: document.draftId,
      storageKey: document.storageKey,
      expectedSha256: document.sha256,
      expectedByteSize: document.byteSize,
      expectedMimeType: document.mimeType,
    });
    status = result.status;
  } catch {
    status = "FAILED";
  }
  return (await repository.finish(document, token, status))
    ? status
    : "SKIPPED";
}
