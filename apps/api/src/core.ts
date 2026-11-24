import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  createHash,
  randomBytes,
  createCipheriv,
  createDecipheriv,
} from "node:crypto";
import nodemailer from "nodemailer";
if (
  process.env.STAYLINK_DB_PROVIDER &&
  process.env.STAYLINK_DB_PROVIDER !== "postgresql"
)
  throw Error(
    "Pembekal Oracle belum disepadukan dengan semua laluan API. Permulaan dibatalkan.",
  );

export const db = new PrismaClient({
  adapter: new PrismaPg({
    connectionString:
      process.env.NODE_ENV === "test"
        ? process.env.TEST_DATABASE_URL
        : process.env.DATABASE_URL,
  }),
});
export const production = process.env.NODE_ENV === "production";
export const origin = process.env.APP_ORIGIN || "http://localhost:5173";
export const hash = (v: string) => createHash("sha256").update(v).digest("hex");
export const token = () => randomBytes(32).toString("hex");
function key() {
  const k = process.env.MFA_ENCRYPTION_KEY;
  if (!k || !/^[0-9a-f]{64}$/i.test(k))
    throw new Error("MFA_ENCRYPTION_KEY mesti 64 aksara heksadesimal.");
  return Buffer.from(k, "hex");
}
export function encrypt(value: string) {
  const iv = randomBytes(12),
    c = createCipheriv("aes-256-gcm", key(), iv);
  return [
    iv.toString("hex"),
    c.update(value, "utf8", "hex") + c.final("hex"),
    c.getAuthTag().toString("hex"),
  ].join(".");
}
export function decrypt(value: string) {
  const [iv, data, tag] = value.split(".");
  const c = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "hex"));
  c.setAuthTag(Buffer.from(tag, "hex"));
  return c.update(data, "hex", "utf8") + c.final("utf8");
}
export const audit = (
  actorId: string | null,
  activeRole: string | null,
  action: string,
  target?: string,
  outcome = "SUCCESS",
  metadata?: any,
) =>
  db.auditLog.create({
    data: { actorId, activeRole, action, target, outcome, metadata },
  });
let mailTransport: ReturnType<typeof nodemailer.createTransport> | undefined;
export function closeMailer() {
  mailTransport?.close();
  mailTransport = undefined;
}
export interface MailOutbox {
  claim(
    id: string,
  ): Promise<{ recipient: string; encryptedPayload: string } | null>;
  markSent(id: string, encryptedPayload: string): Promise<void>;
  markFailed(id: string, lastError: string): Promise<void>;
}

const postgresMailOutbox: MailOutbox = {
  async claim(id) {
    const claimed = await db.emailDeliveryLog.updateMany({
      where: { id, status: { in: ["PENDING", "FAILED"] }, attempts: { lt: 5 } },
      data: { status: "SENDING", attempts: { increment: 1 } },
    });
    return claimed.count
      ? db.emailDeliveryLog.findUniqueOrThrow({ where: { id } })
      : null;
  },
  async markSent(id, encryptedPayload) {
    await db.emailDeliveryLog.update({
      where: { id },
      data: {
        status: "SENT",
        sentAt: new Date(),
        lastError: null,
        encryptedPayload,
      },
    });
  },
  async markFailed(id, lastError) {
    await db.emailDeliveryLog.update({
      where: { id },
      data: { status: "FAILED", lastError },
    });
  },
};

export async function dispatchMail(id: string, outbox = postgresMailOutbox) {
  // Claim atomically: concurrent workers cannot send the same pending row.
  const row = await outbox.claim(id);
  if (!row) return;
  try {
    if (
      process.env.STAYLINK_DEMO_HOST === "true" &&
      !row.recipient.toLowerCase().endsWith("@example.test")
    )
      throw Error("Emel demo hanya dibenarkan untuk alamat latihan.");
    if (production && process.env.SMTP_PRODUCTION_ENABLED !== "true")
      throw Error("Penghantaran produksi belum dibenarkan.");
    const transport = (mailTransport ??= nodemailer.createTransport({
      pool: true,
      maxConnections: 1,
      maxMessages: 100,
      host: process.env.SMTP_HOST || "127.0.0.1",
      port: Number(process.env.SMTP_PORT || 1025),
      connectionTimeout: 5000,
      greetingTimeout: 5000,
      socketTimeout: 10000,
      secure: process.env.SMTP_SECURE === "true",
      ...(process.env.SMTP_USER
        ? {
            auth: {
              user: process.env.SMTP_USER,
              pass: process.env.SMTP_PASSWORD,
            },
          }
        : {}),
    }));
    const payload = JSON.parse(decrypt(row.encryptedPayload));
    await transport.sendMail({
      from: process.env.MAIL_FROM || "STAYLink Ujian <noreply@staylink.test>",
      to: row.recipient,
      ...payload,
    });
  } catch (error: any) {
    const smtpCode = /^[A-Z0-9_]+$/.test(error.code || "")
      ? error.code
      : "SMTP_ERROR";
    await outbox.markFailed(
      id,
      `${smtpCode}: SMTP gagal; semak konfigurasi dan sambungan.`,
    );
    return;
  }
  // A database failure after SMTP accepted the message leaves an uncertain send.
  // Keep SENDING for reconciliation so the retry runner cannot send it again.
  await outbox.markSent(id, encrypt("{}"));
}
export async function notify(
  userId: string,
  type: string,
  title: string,
  message: string,
  emailText?: string,
) {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  const result = await db.$transaction(async (tx) => {
    await tx.notification.create({ data: { userId, type, title, message } });
    return tx.emailDeliveryLog.create({
      data: {
        userId,
        recipient: user.email,
        type,
        encryptedPayload: encrypt(
          JSON.stringify({ subject: title, text: emailText || message }),
        ),
      },
    });
  });
  await dispatchMail(result.id);
}
export async function issueIdentity(userId: string, provider: string) {
  const raw = token();
  await db.authenticationIdentity.create({
    data: {
      userId,
      provider,
      tokenHash: hash(raw),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    },
  });
  return raw;
}
export const safeUser = (u: any) => ({
  id: u.id,
  name: u.name,
  email: u.email,
  phone: u.phone,
  kind: u.kind,
  status: u.status,
  emailVerified: u.emailVerified,
  identificationMasked: u.identificationMasked || null,
});
