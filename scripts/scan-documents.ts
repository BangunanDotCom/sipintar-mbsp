import { runConfiguredDocumentScanBatch } from "../apps/api/src/document-scan-runner.js";

// One-shot operator command, not a daemon or HTTP endpoint.
// Validate opt-in before loading the database/application core.
if (process.env.STAYLINK_DOCUMENT_SCAN_BATCH_ENABLED !== "true")
  throw new Error("STAYLINK_DOCUMENT_SCAN_BATCH_ENABLED=true diperlukan.");

const { db } = await import("../apps/api/src/core.js");
try {
  const summary = await runConfiguredDocumentScanBatch(db);
  console.log(JSON.stringify(summary));
} finally {
  await db.$disconnect();
}
