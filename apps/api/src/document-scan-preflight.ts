import { configuredDocumentStore } from "./document-store-config.js";
import { configuredMalwareScanner } from "./malware-scanner-config.js";

// Preflight must run before importing database/application core in a CLI.
export function validateDocumentScanConfiguration(env: NodeJS.ProcessEnv): number {
  if (env.STAYLINK_DOCUMENT_SCAN_BATCH_ENABLED !== "true")
    throw new Error("Kelompok imbasan dokumen belum diaktifkan.");
  if (!env.STAYLINK_DOCUMENT_STORE || env.STAYLINK_DOCUMENT_STORE === "disabled" ||
      env.STAYLINK_CLAMAV_ENABLED !== "true")
    throw new Error("Storan persendirian dan ClamAV mesti diaktifkan sebelum imbasan.");
  configuredDocumentStore(env);
  configuredMalwareScanner(env);
  const rawLimit = env.STAYLINK_DOCUMENT_SCAN_BATCH_LIMIT;
  const limit = rawLimit === undefined ? 10 : Number(rawLimit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 50)
    throw new Error("Had kelompok imbasan mesti antara 1 hingga 50.");
  return limit;
}
