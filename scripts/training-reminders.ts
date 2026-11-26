import "dotenv/config";
import nodemailer from "nodemailer";
import { db } from "../apps/api/src/core.js";
import { syntheticPortalDatabase } from "../apps/api/src/synthetic-portal-gate.js";
import {
  deliverTrainingReminders,
  scheduleTrainingReminders,
  trainingRemindersEnabled,
} from "../apps/api/src/training-reminders.js";

async function main() {
  const database = syntheticPortalDatabase();
  if (
    !trainingRemindersEnabled() ||
    process.env.SMTP_HOST !== "127.0.0.1" ||
    process.env.SMTP_PORT !== "1025" ||
    process.env.SMTP_PRODUCTION_ENABLED !== "false" ||
    process.env.SMTP_SECURE === "true" ||
    process.env.SMTP_USER ||
    process.env.SMTP_PASSWORD
  )
    throw Error(
      "Peringatan memerlukan PostgreSQL latihan dan Mailpit loopback tanpa kelayakan SMTP.",
    );
  const [{ name }] = await db.$queryRaw<
    { name: string }[]
  >`SELECT current_database()::text AS name`;
  if (name !== database) throw Error("Pangkalan data latihan tidak sepadan.");
  const transport = nodemailer.createTransport({
    host: "127.0.0.1",
    port: 1025,
    secure: false,
    ignoreTLS: true,
    connectionTimeout: 5000,
    greetingTimeout: 5000,
    socketTimeout: 10000,
  });
  try {
    const queued = await scheduleTrainingReminders();
    await deliverTrainingReminders(async (email) => {
      await transport.sendMail({
        from: "STAYLink LATIHAN <noreply@example.test>",
        ...email,
      });
    });
    console.log(
      `Peringatan baharu: ${queued}. Semak status dalam pemantauan latihan.`,
    );
  } finally {
    transport.close();
  }
}
try {
  await main();
} catch {
  console.error("Pemprosesan peringatan latihan gagal.");
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
