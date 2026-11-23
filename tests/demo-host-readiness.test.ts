import { spawnSync } from "node:child_process";
import { expect, it } from "vitest";
import { inspectDemoHost } from "../apps/api/src/demo-host-config.mjs";
import { syntheticPortalDatabase } from "../apps/api/src/synthetic-portal-gate";

const url =
  "postgresql://fixture:synthetic@127.0.0.1:5432/staylink_issue62_preview_test";
const settings = {
  NODE_ENV: "development",
  STAYLINK_DEMO_HOST: "true",
  STAYLINK_SYNTHETIC_PORTAL: "true",
  APP_ORIGIN: "https://localhost:5443",
  API_PORT: "3001",
  DATABASE_URL: url,
  TEST_DATABASE_URL: url,
  MFA_ENCRYPTION_KEY: "12".repeat(32),
  IDENTITY_DATA_KEY: "ab".repeat(32),
  STAYLINK_SYNTHETIC_CALLBACK_KEY: "ef".repeat(32),
  STAYLINK_SYNTHETIC_PIC_ID: "01234567-0123-4123-8123-0123456789ab",
  STAYLINK_SYNTHETIC_SUPERVISOR_ID: "01234567-0123-4123-8123-0123456789ac",
  STAYLINK_SYNTHETIC_DISTRICT: "SPU",
  STAYLINK_DOCUMENT_STORE: "disabled",
  STAYLINK_LOCAL_DOCUMENT_STORE_ENABLED: "false",
  STAYLINK_CLAMAV_ENABLED: "false",
  STAYLINK_DOCUMENT_SCAN_BATCH_ENABLED: "false",
  SMTP_PRODUCTION_ENABLED: "false",
  SMTP_HOST: "127.0.0.1",
  SMTP_PORT: "1025",
  SMTP_SECURE: "false",
};

it("shares the dedicated DB validation with synthetic runtime", () => {
  expect(inspectDemoHost(settings)).toEqual({
    failures: [],
    database: "staylink_issue62_preview_test",
    origin: settings.APP_ORIGIN,
  });
  expect(syntheticPortalDatabase(settings)).toBe(
    "staylink_issue62_preview_test",
  );
  expect(
    syntheticPortalDatabase({ ...settings, STAYLINK_DEMO_HOST: "false" }),
  ).toBeNull();
  expect(
    syntheticPortalDatabase({ ...settings, NODE_ENV: "production" }),
  ).toBeNull();
});

it.each([
  [
    "external origin without TLS",
    { APP_ORIGIN: "http://demo.example.test" },
    /HTTPS/,
  ],
  [
    "external credential in origin",
    { APP_ORIGIN: "https://secret@demo.example.test" },
    /HTTPS/,
  ],
  ["origin path", { APP_ORIGIN: "https://demo.example.test/demo" }, /HTTPS/],
  ["mismatched DB URLs", { TEST_DATABASE_URL: url + "old" }, /PostgreSQL/],
  [
    "DB protocol",
    {
      DATABASE_URL: url.replace("postgresql:", "https:"),
      TEST_DATABASE_URL: url.replace("postgresql:", "https:"),
    },
    /PostgreSQL/,
  ],
  [
    "wrong fixture name",
    {
      DATABASE_URL: url.replace("issue62", "issue58"),
      TEST_DATABASE_URL: url.replace("issue62", "issue58"),
    },
    /PostgreSQL/,
  ],
  [
    "DB URL options",
    {
      DATABASE_URL: url + "?sslmode=disable",
      TEST_DATABASE_URL: url + "?sslmode=disable",
    },
    /PostgreSQL/,
  ],
  ["wrong SMTP TLS", { SMTP_SECURE: "true" }, /SMTP/],
  ["SMTP credentials", { SMTP_PASSWORD: "PRIVATE-EXAMPLE" }, /SMTP/],
  [
    "same officer identity",
    { STAYLINK_SYNTHETIC_SUPERVISOR_ID: settings.STAYLINK_SYNTHETIC_PIC_ID },
    /PIC/,
  ],
  [
    "duplicate secret with case variation",
    {
      IDENTITY_DATA_KEY: settings.STAYLINK_SYNTHETIC_CALLBACK_KEY.toUpperCase(),
    },
    /berasingan/,
  ],
])("rejects %s", (_label, changes, expected) => {
  expect(
    inspectDemoHost({ ...settings, ...changes }).failures.join(" "),
  ).toMatch(expected);
});

it("prepares without kit bindings and rejects launching without them", () => {
  const empty = {
    ...settings,
    STAYLINK_SYNTHETIC_CALLBACK_KEY: "",
    STAYLINK_SYNTHETIC_PIC_ID: "",
  };
  expect(inspectDemoHost(empty, { requireKit: false }).failures).toEqual([]);
  expect(inspectDemoHost(empty).failures).toHaveLength(2);
});

it("returns non-zero and redacts invalid values in the static CLI", () => {
  const result = spawnSync(
    process.execPath,
    ["scripts/demo-host-readiness.mjs", "--prepare"],
    {
      encoding: "utf8",
      env: { ...settings, MFA_ENCRYPTION_KEY: "PRIVATE-EXAMPLE" },
    },
  );
  expect(result.status).toBe(1);
  const report = JSON.parse(result.stdout);
  expect(report.status).toBe("BLOCKED");
  expect(report.failures.join(" ")).toMatch(/MFA_ENCRYPTION_KEY/);
  expect(result.stdout + result.stderr).not.toContain("PRIVATE-EXAMPLE");
  expect(result.stdout + result.stderr).not.toContain("postgresql://");
});
