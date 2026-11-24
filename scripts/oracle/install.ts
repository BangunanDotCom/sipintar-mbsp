import { oracleConfig } from "../../apps/api/src/oracle/config.js";
import { createOraclePool } from "../../apps/api/src/oracle/pool.js";
import { migrateOracle } from "./migrations.js";

const command = process.argv[2];
if (
  !["preflight", "apply"].includes(command ?? "") ||
  process.argv.length !== 3
)
  throw Error("Gunakan preflight atau apply untuk Oracle makmal.");
const pool = await createOraclePool(oracleConfig(process.env, "install"));
try {
  console.log(
    await pool.use((connection) =>
      migrateOracle(connection, command === "apply"),
    ),
  );
} finally {
  await pool.close();
}
