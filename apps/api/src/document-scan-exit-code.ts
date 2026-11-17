import type { ScanBatchSummary } from "./document-scan-batch.js";

// An infected document is a valid scan result and remains blocked by its status.
// A FAILED scan requires operator attention and should fail a scheduled job.
export function documentScanBatchExitCode(summary: ScanBatchSummary): 0 | 1 {
  if (!Object.values(summary).every((value) => Number.isInteger(value) && value >= 0))
    throw new Error("Ringkasan imbasan tidak sah.");
  if (summary.clean + summary.infected + summary.failed + summary.skipped !== summary.examined)
    throw new Error("Jumlah ringkasan imbasan tidak sepadan.");
  return summary.failed > 0 ? 1 : 0;
}
