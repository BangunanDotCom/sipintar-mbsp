import nodemailer from "nodemailer";
import { oracleConfig } from "../../apps/api/src/oracle/config.js";
import { createOraclePool } from "../../apps/api/src/oracle/pool.js";
import { createOracleTrainingReminders } from "../../apps/api/src/oracle/training-reminders.js";
import { oracleTrainingRemindersEnabled } from "../../apps/api/src/training-reminders.js";

const env = process.env;
if (
  !oracleTrainingRemindersEnabled() ||
  !env.ORACLE_LAB_TRAINING_WORKER_USER ||
  env.ORACLE_USER !== env.ORACLE_LAB_TRAINING_WORKER_USER ||
  env.ORACLE_USER === env.ORACLE_LAB_RUNTIME_USER ||
  env.ORACLE_USER === env.ORACLE_LAB_DELEGATION_SCANNER_USER ||
  env.SMTP_HOST !== "127.0.0.1" ||
  env.SMTP_PORT !== "1025" ||
  env.SMTP_PRODUCTION_ENABLED !== "false" ||
  env.SMTP_SECURE === "true" ||
  env.SMTP_USER ||
  env.SMTP_PASSWORD
)
  throw Error(
    "Peringatan Oracle memerlukan akaun worker dan Mailpit loopback makmal.",
  );
const pool = await createOraclePool(oracleConfig(env, "runtime"));
const transport = nodemailer.createTransport({
  host: "127.0.0.1",
  port: 1025,
  secure: false,
  ignoreTLS: true,
  connectionTimeout: 5000,
  greetingTimeout: 5000,
  socketTimeout: 10000,
});
const worker = createOracleTrainingReminders(pool);
try {
  const queued = await worker.schedule();
  await worker.deliver(async (email) => {
    await transport.sendMail({
      from: "STAYLink LATIHAN <noreply@example.test>",
      ...email,
    });
  });
  await worker.logRun("SUCCESS", { queued });
  console.log(`Peringatan baharu: ${queued}.`);
} catch {
  await worker.logRun("FAILURE", { code: "WORKER_FAILED" }).catch(() => {});
  console.error("Pemprosesan peringatan Oracle makmal gagal.");
  process.exitCode = 1;
} finally {
  transport.close();
  await pool.close();
}
