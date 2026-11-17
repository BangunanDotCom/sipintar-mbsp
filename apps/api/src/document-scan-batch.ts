import type { PrismaClient } from "@prisma/client";
import type { PrivateDocumentStore } from "./private-document-store.js";
import type { DocumentMalwareScanner } from "./document-malware-scanner.js";
import { processPendingDocumentScan } from "./document-scan-worker.js";

export type ScanBatchSummary = {
  examined: number;
  clean: number;
  infected: number;
  failed: number;
  skipped: number;
};

// Internal job-runner entrypoint, not an HTTP route.
// No auto-loop: scheduler, storage and scanner must be explicitly configured.
export async function processPendingDocumentScanBatch(
  db: PrismaClient,
  store: PrivateDocumentStore,
  scanner: DocumentMalwareScanner,
  options: { limit?: number } = {},
): Promise<ScanBatchSummary> {
  const limit = options.limit ?? 10;
  if (!Number.isInteger(limit) || limit < 1 || limit > 50)
    throw new Error("Had kelompok imbasan mesti antara 1 hingga 50.");
  const pending = await db.applicationDocument.findMany({
    where: {
      supersededAt: null,
      OR: [
        { scanStatus: "PENDING" },
        { scanStatus: "SCANNING", scanLeaseExpiresAt: { lt: new Date() } },
      ],
    },
    select: { id: true },
    orderBy: [{ uploadedAt: "asc" }, { id: "asc" }],
    take: limit,
  });
  const summary: ScanBatchSummary = {
    examined: pending.length, clean: 0, infected: 0, failed: 0, skipped: 0,
  };
  for (const document of pending) {
    // A single unexpected worker error must not prevent later documents from being scanned.
    // Count it as FAILED so the CLI returns a nonzero exit status for operator follow-up.
    let result: "CLEAN" | "INFECTED" | "FAILED" | "SKIPPED";
    try {
      result = await processPendingDocumentScan(db, store, scanner, document.id);
    } catch {
      result = "FAILED";
    }
    if (result === "CLEAN") summary.clean++;
    else if (result === "INFECTED") summary.infected++;
    else if (result === "FAILED") summary.failed++;
    else summary.skipped++;
  }
  return summary;
}
