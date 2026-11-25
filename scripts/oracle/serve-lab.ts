import { buildOracleLabApp } from "../../apps/api/src/app.js";
import { origin } from "../../apps/api/src/core.js";
import { oracleConfig } from "../../apps/api/src/oracle/config.js";
import { createOraclePool } from "../../apps/api/src/oracle/pool.js";
import { createOracleRepositories } from "../../apps/api/src/oracle/provider.js";

const port = Number(process.env.ORACLE_LAB_API_PORT ?? "3301");
const allowedOrigin = new URL(origin);
if (
  process.env.NODE_ENV !== "test" ||
  process.env.STAYLINK_ORACLE_LAB_HTTP !== "true" ||
  process.env.STAYLINK_DEMO_HOST === "true" ||
  !Number.isInteger(port) ||
  port < 1 ||
  port > 65535 ||
  allowedOrigin.protocol !== "http:" ||
  !["localhost", "127.0.0.1"].includes(allowedOrigin.hostname) ||
  allowedOrigin.origin !== origin
)
  throw Error(
    "API Oracle makmal memerlukan proses ujian dan HTTP loopback sintetik.",
  );

const pool = await createOraclePool(oracleConfig(process.env, "runtime"));
try {
  const repositories = createOracleRepositories(pool);
  await repositories.checkConnection();
  const app = await buildOracleLabApp(repositories);
  app.addHook("onClose", async () => pool.close());
  try {
    await app.listen({ host: "127.0.0.1", port });
  } catch (error) {
    await app.close();
    throw error;
  }
  for (const signal of ["SIGINT", "SIGTERM"] as const)
    process.once(signal, () => {
      void app.close().catch(() => {
        process.exitCode = 1;
      });
    });
} catch (error) {
  await pool.close().catch(() => {});
  throw error;
}
