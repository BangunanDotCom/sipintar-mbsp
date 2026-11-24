import type { PrismaClient } from "@prisma/client";
import type { DocumentScanRepository } from "./document-scan-repository.js";
import { configuredDocumentStore } from "./document-store-config.js";
import { configuredMalwareScanner } from "./malware-scanner-config.js";
import {
  processPendingDocumentScanBatch,
  type ScanBatchSummary,
} from "./document-scan-batch.js";
import { validateDocumentScanConfiguration } from "./document-scan-preflight.js";

// Deliberately opt-in: never scan with a disabled store or scanner.
export async function runConfiguredDocumentScanBatch(
  db: PrismaClient | DocumentScanRepository,
  env: NodeJS.ProcessEnv = process.env,
): Promise<ScanBatchSummary> {
  const limit = validateDocumentScanConfiguration(env);
  const store = configuredDocumentStore(env);
  const scanner = configuredMalwareScanner(env);
  return processPendingDocumentScanBatch(db, store, scanner, { limit });
}
