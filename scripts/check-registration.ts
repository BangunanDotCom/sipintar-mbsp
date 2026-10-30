import "dotenv/config";
import pg from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { readdir, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { safeServerFailure } from "../apps/api/src/errors.js";

const variable =
  process.env.NODE_ENV === "test" ? "TEST_DATABASE_URL" : "DATABASE_URL";
const raw = process.env[variable];
const checks: Record<string, unknown> = {
  environment: process.env.CODESPACES === "true" ? "codespaces" : "other",
  connectionVariable: variable,
  databaseUrl: "MISSING_OR_INVALID",
  identityKey: /^[a-f0-9]{64}$/i.test(process.env.IDENTITY_DATA_KEY || "")
    ? "PASS"
    : "MISSING_OR_INVALID",
  mfaKey: /^[a-f0-9]{64}$/i.test(process.env.MFA_ENCRYPTION_KEY || "")
    ? "PASS"
    : "MISSING_OR_INVALID",
  postgres: "NOT_CHECKED",
  migrations: "NOT_CHECKED",
  applicantRole: "NOT_CHECKED",
  prisma: "NOT_CHECKED",
};
let valid = false;
try {
  const url = new URL(raw || "");
  valid =
    ["postgres:", "postgresql:"].includes(url.protocol) &&
    !!url.hostname &&
    url.pathname.length > 1;
} catch {
  /* Never print URL parsing exceptions. */
}
if (valid) {
  checks.databaseUrl = "PASS";
  const client = new pg.Client({
    connectionString: raw,
    connectionTimeoutMillis: 5000,
    query_timeout: 5000,
  });
  try {
    await client.connect();
    await client.query("BEGIN READ ONLY");
    await client.query("SELECT 1");
    checks.postgres = "PASS";
    const ledger = await client.query(
      "SELECT to_regclass('public._staylink_migrations') IS NOT NULL AS present",
    );
    if (ledger.rows[0].present) {
      const applied = await client.query(
        "SELECT name,checksum FROM _staylink_migrations",
      );
      const map = new Map(applied.rows.map((row) => [row.name, row.checksum]));
      const directory = new URL("../prisma/migrations/", import.meta.url);
      const versions = await Promise.all(
        (await readdir(directory))
          .filter((name) => /^\d/.test(name))
          .sort()
          .map(async (name) => ({
            name,
            applied: map.has(name),
            checksumMatches:
              map.get(name) ===
              createHash("sha256")
                .update(
                  await readFile(new URL(`${name}/migration.sql`, directory)),
                )
                .digest("hex"),
          })),
      );
      checks.migrations = versions.every(
        (row) => row.applied && row.checksumMatches,
      )
        ? "PASS"
        : "PENDING_OR_CHANGED";
      checks.migrationVersions = versions;
    } else checks.migrations = "LEDGER_MISSING";
    const roles = await client.query(
      "SELECT EXISTS(SELECT 1 FROM roles WHERE id=$1) AS present",
      ["PEMOHON"],
    );
    checks.applicantRole = roles.rows[0].present ? "PASS" : "MISSING";
    await client.query("ROLLBACK");
  } catch (error) {
    const failure = safeServerFailure(error);
    checks.databaseFailure = {
      code: failure.code,
      diagnosticCode: failure.diagnosticCode,
    };
  } finally {
    await client.end().catch(() => {});
  }
  if (checks.postgres === "PASS") {
    try {
      const { PrismaClient } = await import("@prisma/client");
      const prisma = new PrismaClient({
        adapter: new PrismaPg({
          connectionString: raw,
          connectionTimeoutMillis: 5000,
        }),
        log: [],
      });
      try {
        await prisma.user.findFirst({
          where: { id: "__staylink_readonly_diagnostic_no_user__" },
          select: {
            id: true,
            identificationHash: true,
            identificationEncrypted: true,
            identificationMasked: true,
            consentAt: true,
          },
        });
        checks.prisma = "PASS";
      } finally {
        await prisma.$disconnect();
      }
    } catch (error) {
      const failure = safeServerFailure(error);
      checks.prisma = "NOT_READY";
      checks.prismaFailure = {
        code: failure.code,
        diagnosticCode: failure.diagnosticCode,
      };
    }
  }
}
const ready = [
  "databaseUrl",
  "identityKey",
  "mfaKey",
  "postgres",
  "migrations",
  "applicantRole",
  "prisma",
].every((key) => checks[key] === "PASS");
console.log(
  JSON.stringify(
    { status: ready ? "PASS" : "NOT_READY", readOnly: true, checks },
    null,
    2,
  ),
);
process.exitCode = ready ? 0 : 1;
