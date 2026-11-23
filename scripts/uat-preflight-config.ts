import { syntheticPortalDatabase } from "../apps/api/src/synthetic-portal-gate.js";
import { loadSyntheticOwnerPolicy } from "../apps/api/src/synthetic-owner-policy.js";

export class PreflightError extends Error {
  override name = "PreflightError";
}

export function fixtureEnvironment(env: NodeJS.ProcessEnv = process.env) {
  if (
    env.STAYLINK_SYNTHETIC_PORTAL !== "true" ||
    !["test", "development"].includes(env.NODE_ENV ?? "")
  )
    throw new PreflightError(
      "Aktifkan portal sintetik dalam NODE_ENV test atau development.",
    );

  const database = syntheticPortalDatabase(env);
  if (
    !database?.startsWith("staylink_issue58_") ||
    !env.DATABASE_URL ||
    !new URL(env.DATABASE_URL).username ||
    !new URL(env.DATABASE_URL).password
  )
    throw new PreflightError(
      "Kedua-dua URL PostgreSQL mesti sama dan menggunakan 127.0.0.1:5432 serta DB staylink_issue58_<sesi>_test.",
    );

  for (const key of ["MFA_ENCRYPTION_KEY", "IDENTITY_DATA_KEY"] as const) {
    if (!/^[a-f0-9]{64}$/i.test(env[key] ?? ""))
      throw new PreflightError(
        `Tetapkan ${key} latihan dengan 64 aksara heksadesimal.`,
      );
  }
  if (
    env.MFA_ENCRYPTION_KEY!.toLowerCase() ===
    env.IDENTITY_DATA_KEY!.toLowerCase()
  )
    throw new PreflightError(
      "Gunakan kunci latihan berasingan untuk MFA dan identiti.",
    );

  if (
    (env.STAYLINK_DOCUMENT_STORE ?? "disabled") !== "disabled" ||
    env.STAYLINK_LOCAL_DOCUMENT_STORE_ENABLED === "true" ||
    env.STAYLINK_CLAMAV_ENABLED === "true" ||
    env.STAYLINK_DOCUMENT_SCAN_BATCH_ENABLED === "true"
  )
    throw new PreflightError(
      "Matikan storan dokumen dan tugas imbasan bagi latihan.",
    );

  if (
    (env.SMTP_HOST || "127.0.0.1") !== "127.0.0.1" ||
    (env.SMTP_PORT || "1025") !== "1025" ||
    env.SMTP_SECURE === "true" ||
    env.SMTP_PRODUCTION_ENABLED === "true" ||
    env.SMTP_USER ||
    env.SMTP_PASSWORD ||
    (env.MAIL_FROM &&
      !/^[^<>\r\n]*<[^<>@\s]+@[a-z0-9.-]+\.test>$|^[^<>@\s]+@[a-z0-9.-]+\.test$/i.test(
        env.MAIL_FROM,
      ))
  )
    throw new PreflightError(
      "Tetapkan SMTP Mailpit pada 127.0.0.1:1025 tanpa kelayakan dan gunakan pengirim domain .test.",
    );

  if (
    !/^http:\/\/(?:localhost|127\.0\.0\.1):5173$/.test(
      env.APP_ORIGIN || "http://localhost:5173",
    )
  )
    throw new PreflightError(
      "Tetapkan APP_ORIGIN latihan kepada localhost atau 127.0.0.1 pada port 5173.",
    );

  const owner = loadSyntheticOwnerPolicy(
    env.STAYLINK_SYNTHETIC_POLICY_JSON ?? undefined,
  );
  if (
    !owner ||
    !owner.config.review.enabled ||
    owner.config.billing.mode !== "MOCK"
  )
    throw new PreflightError(
      "Polisi sintetik tidak sah atau semakan pegawai dan bil MOCK belum aktif.",
    );

  return {
    database,
    version: owner.config.version,
    fingerprint: owner.fingerprint,
  };
}
