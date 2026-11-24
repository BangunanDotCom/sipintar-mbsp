import { documentScanBatchExitCode } from "../../apps/api/src/document-scan-exit-code.js";
import { validateDocumentScanConfiguration } from "../../apps/api/src/document-scan-preflight.js";
import { runConfiguredDocumentScanBatch } from "../../apps/api/src/document-scan-runner.js";
import { oracleConfig } from "../../apps/api/src/oracle/config.js";
import { createOracleDocumentScanRepository } from "../../apps/api/src/oracle/document-scan.js";
import { createOraclePool } from "../../apps/api/src/oracle/pool.js";

validateDocumentScanConfiguration(process.env);
const pool = await createOraclePool(oracleConfig(process.env, "runtime"));
try {
  const summary = await runConfiguredDocumentScanBatch(
    createOracleDocumentScanRepository(pool),
  );
  console.log(JSON.stringify(summary));
  process.exitCode = documentScanBatchExitCode(summary);
} finally {
  await pool.close();
}
