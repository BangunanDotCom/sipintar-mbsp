import type { PrismaClient } from "@prisma/client";
import { configuredDocumentStore } from "./document-store-config.js";
import { configuredMalwareScanner } from "./malware-scanner-config.js";
import { processPendingDocumentScanBatch, type ScanBatchSummary } from "./document-scan-batch.js";

// Deliberately opt-in: never scan with a disabled store or scanner.
export async function runConfiguredDocumentScanBatch(
  db: PrismaClient,
  env: NodeJS.ProcessEnv = process.env,
): Promise<ScanBatchSummary> {
  if (env.STAYLINK_DOCUMENT_SCAN_BATCH_ENABLED !== "true")
    throw new Error("Kelompok imbasan dokumen belum diaktifkan.");
  if (env.STAYLINK_DOCUMENT_STORE === undefined ||
      env.STAYLINK_DOCUMENT_STORE === "disabled" ||
      env.STAYLINK_CLAMAV_ENABLED !== "true")
    throw new Error("Storan persendirian dan ClamAV mesti diaktifkan sebelum imbasan.");
  const store = configuredDocumentStore(env);
  const scanner = configuredMalwareScanner(env);
  const limit = env.STAYLINK_DOCUMENT_SCAN_BATCH_LIMIT === undefined
    ? 10 : Number(env.STAYLINK_DOCUMENT_SCAN_BATCH_LIMIT);
  return processPendingDocumentScanBatch(db, store, scanner, { limit });
}
