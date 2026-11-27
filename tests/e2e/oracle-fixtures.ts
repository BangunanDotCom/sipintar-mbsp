import { readFile } from "node:fs/promises";
import { parse } from "dotenv";
import type { Connection } from "oracledb";
import { oracleConfig } from "../../apps/api/src/oracle/config.js";
import { createOraclePool } from "../../apps/api/src/oracle/pool.js";

export async function withOracleBrowserFixture(
  fixture: (connection: Connection) => Promise<void>,
) {
  const ownerFile = process.env.ORACLE_LAB_OWNER_ENV;
  if (
    process.env.NODE_ENV !== "test" ||
    process.env.STAYLINK_ORACLE_LAB_HTTP !== "true" ||
    !ownerFile
  )
    throw Error("Sediakan Oracle makmal loopback untuk membina data ujian.");
  const pool = await createOraclePool(
    oracleConfig(parse(await readFile(ownerFile)), "install"),
  );
  try {
    await pool.transaction(fixture);
  } finally {
    await pool.close();
  }
}
