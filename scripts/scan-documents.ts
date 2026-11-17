import "dotenv/config";
import { validateDocumentScanConfiguration } from "../apps/api/src/document-scan-preflight.js";
import { runConfiguredDocumentScanBatch } from "../apps/api/src/document-scan-runner.js";
import { documentScanBatchExitCode } from "../apps/api/src/document-scan-exit-code.js";

// One-shot command. Reject unsafe or incomplete configuration before creating a DB client.
validateDocumentScanConfiguration(process.env);

const { db } = await import("../apps/api/src/core.js");
try {
  const summary = await runConfiguredDocumentScanBatch(db);
  console.log(JSON.stringify(summary));
  process.exitCode = documentScanBatchExitCode(summary);
} finally {
  await db.$disconnect();
}
