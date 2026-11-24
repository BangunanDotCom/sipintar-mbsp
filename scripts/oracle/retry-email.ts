import { closeMailer } from "../../apps/api/src/core.js";
import { oracleConfig } from "../../apps/api/src/oracle/config.js";
import { createOracleNotificationRepository } from "../../apps/api/src/oracle/notification.js";
import { createOraclePool } from "../../apps/api/src/oracle/pool.js";

const pool = await createOraclePool(oracleConfig(process.env, "runtime"));
try {
  const count = await createOracleNotificationRepository(pool).retryPending();
  console.log(`${count} rekod emel makmal diperiksa.`);
} finally {
  closeMailer();
  await pool.close();
}
