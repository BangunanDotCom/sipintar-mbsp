import { URL } from "node:url";
// Shared by the static preflight and the hosted-demo runtime. Never returns secrets.
export function inspectDemoHost(env = process.env, { requireKit = true } = {}) {
  const failures = [];
  if (
    env.STAYLINK_DEMO_HOST !== "true" ||
    env.NODE_ENV !== "development" ||
    env.STAYLINK_SYNTHETIC_PORTAL !== "true"
  )
    failures.push(
      "Tetapkan STAYLINK_DEMO_HOST=true, NODE_ENV=development dan STAYLINK_SYNTHETIC_PORTAL=true.",
    );
  if (env.API_PORT !== "3001")
    failures.push("API demo mesti menggunakan loopback port 3001.");

  let origin = null;
  try {
    const url = new URL(env.APP_ORIGIN);
    if (url.protocol === "https:" && url.origin === env.APP_ORIGIN)
      origin = url.origin;
  } catch {
    /* handled below */
  }
  if (!origin)
    failures.push(
      "APP_ORIGIN mesti origin HTTPS tepat tanpa laluan, parameter atau kelayakan.",
    );

  let database = null;
  try {
    const url = new URL(env.DATABASE_URL);
    if (
      env.DATABASE_URL === env.TEST_DATABASE_URL &&
      url.protocol === "postgresql:" &&
      url.hostname === "127.0.0.1" &&
      url.port === "5432" &&
      url.username &&
      url.password &&
      !url.search &&
      !url.hash &&
      /^\/staylink_issue62_[a-z0-9_]{1,36}_test$/.test(url.pathname)
    )
      database = url.pathname.slice(1);
  } catch {
    /* handled below */
  }
  if (!database)
    failures.push(
      "Kedua-dua URL mesti sama dan menggunakan PostgreSQL 127.0.0.1:5432 dengan DB staylink_issue62_<sesi>_test.",
    );

  const keys = ["MFA_ENCRYPTION_KEY", "IDENTITY_DATA_KEY"];
  if (requireKit) keys.push("STAYLINK_SYNTHETIC_CALLBACK_KEY");
  for (const key of keys) {
    const syntax =
      key === "STAYLINK_SYNTHETIC_CALLBACK_KEY"
        ? /^[a-f0-9]{64}$/
        : /^[a-f0-9]{64}$/i;
    if (!syntax.test(env[key] ?? "") || /^([a-f0-9])\1{63}$/i.test(env[key]))
      failures.push(
        `${key} memerlukan kunci latihan rawak 64 aksara heksadesimal.`,
      );
  }
  if (new Set(keys.map((key) => env[key]?.toLowerCase())).size !== keys.length)
    failures.push("Gunakan kunci MFA, identiti dan callback yang berasingan.");
  if (requireKit) {
    const pic = env.STAYLINK_SYNTHETIC_PIC_ID;
    const ppsk = env.STAYLINK_SYNTHETIC_SUPERVISOR_ID;
    const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
    if (
      !uuid.test(pic ?? "") ||
      !uuid.test(ppsk ?? "") ||
      pic === ppsk ||
      env.STAYLINK_SYNTHETIC_DISTRICT !== "SPU"
    )
      failures.push("Bekalkan peruntukan PIC dan PPSK SPU daripada kit demo.");
  }

  if (
    env.STAYLINK_DOCUMENT_STORE !== "disabled" ||
    [
      "STAYLINK_LOCAL_DOCUMENT_STORE_ENABLED",
      "STAYLINK_CLAMAV_ENABLED",
      "STAYLINK_DOCUMENT_SCAN_BATCH_ENABLED",
      "SMTP_PRODUCTION_ENABLED",
      "SMTP_SECURE",
    ].some((key) => env[key] !== "false")
  )
    failures.push(
      "Matikan storan, imbasan, SMTP produksi dan SMTP TLS di loopback Mailpit.",
    );
  if (
    env.SMTP_HOST !== "127.0.0.1" ||
    env.SMTP_PORT !== "1025" ||
    env.SMTP_USER ||
    env.SMTP_PASSWORD ||
    env.MAIL_FROM
  )
    failures.push(
      "Gunakan SMTP Mailpit 127.0.0.1:1025 tanpa kelayakan atau pengirim tersuai.",
    );
  return { failures, database, origin };
}
