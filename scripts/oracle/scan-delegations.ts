import { configuredMalwareScanner } from "../../apps/api/src/malware-scanner-config.js";
import { oracleConfig } from "../../apps/api/src/oracle/config.js";
import { createOracleDelegationScanner } from "../../apps/api/src/oracle/delegation-scan.js";
import { createOraclePool } from "../../apps/api/src/oracle/pool.js";

const env = process.env;
if (
  env.NODE_ENV !== "test" ||
  env.STAYLINK_DEMO_HOST === "true" ||
  env.STAYLINK_DELEGATION_SCAN_ENABLED !== "true" ||
  env.STAYLINK_CLAMAV_ENABLED !== "true" ||
  env.ORACLE_USER !== env.ORACLE_LAB_DELEGATION_SCANNER_USER ||
  !env.ORACLE_LAB_RUNTIME_USER ||
  env.ORACLE_USER === env.ORACLE_LAB_RUNTIME_USER
)
  throw Error(
    "Pengimbasan surat kuasa Oracle memerlukan akaun worker makmal berasingan dan scanner yang didayakan.",
  );

const pool = await createOraclePool(oracleConfig(env, "runtime"));
try {
  const scanner = configuredMalwareScanner();
  const worker = createOracleDelegationScanner(pool);
  for (const { id } of await worker.due(new Date()))
    await worker.scan(scanner, id);
} finally {
  await pool.close();
}
