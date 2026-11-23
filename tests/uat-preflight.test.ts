import { chmod, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { fixtureEnvironment } from "../scripts/uat-preflight-config";
import { readTrainingKit } from "../scripts/uat-preflight-kit";

const url =
  "postgresql://fixture:synthetic@127.0.0.1:5432/staylink_issue58_preview_test";
const env = {
  NODE_ENV: "test",
  STAYLINK_SYNTHETIC_PORTAL: "true",
  DATABASE_URL: url,
  TEST_DATABASE_URL: url,
  MFA_ENCRYPTION_KEY: "1".repeat(64),
  IDENTITY_DATA_KEY: "2".repeat(64),
};

it.each([
  ["disabled gate", { STAYLINK_SYNTHETIC_PORTAL: "false" }, /portal sintetik/],
  ["production", { NODE_ENV: "production" }, /portal sintetik/],
  ["missing key", { MFA_ENCRYPTION_KEY: undefined }, /MFA_ENCRYPTION_KEY/],
  [
    "invalid key",
    { IDENTITY_DATA_KEY: "PRIVATE-EXAMPLE" },
    /IDENTITY_DATA_KEY/,
  ],
  ["reused key", { IDENTITY_DATA_KEY: env.MFA_ENCRYPTION_KEY }, /berasingan/],
  ["different URLs", { TEST_DATABASE_URL: url + "invalid" }, /Kedua-dua URL/],
  [
    "wrong DB",
    {
      DATABASE_URL: url.replace("58", "54"),
      TEST_DATABASE_URL: url.replace("58", "54"),
    },
    /Kedua-dua URL/,
  ],
  [
    "external DB",
    {
      DATABASE_URL: url.replace("127.0.0.1", "db.example.test"),
      TEST_DATABASE_URL: url.replace("127.0.0.1", "db.example.test"),
    },
    /Kedua-dua URL/,
  ],
  ["external SMTP", { SMTP_HOST: "smtp.example.test" }, /SMTP Mailpit/],
  ["SMTP secret", { SMTP_PASSWORD: "PRIVATE-EXAMPLE" }, /SMTP Mailpit/],
  ["real storage", { STAYLINK_DOCUMENT_STORE: "local" }, /storan dokumen/],
  [
    "invalid policy",
    { STAYLINK_SYNTHETIC_POLICY_JSON: '{"mode":"PRODUCTION"}' },
    /Polisi sintetik/,
  ],
])(
  "rejects %s before opening training services",
  (_reason, changes, message) => {
    expect(() => fixtureEnvironment({ ...env, ...changes })).toThrow(message);
  },
);

it("describes only the safe database and policy fingerprint", () => {
  expect(fixtureEnvironment(env)).toEqual({
    database: "staylink_issue58_preview_test",
    version: "SYNTHETIC-BASELINE-v1",
    fingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
  });
});

let directory: string;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "staylink-uat-preflight-test-"));
});
afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

it("rejects an unsafe directory and private files with broad permissions or symlinks", async () => {
  const expected = fixtureEnvironment(env);
  await chmod(directory, 0o755);
  await expect(readTrainingKit(directory, expected, env)).rejects.toThrow(
    /0700/,
  );
  await chmod(directory, 0o700);
  const file = join(directory, "preflight.json");
  await writeFile(file, JSON.stringify(expected), { mode: 0o644 });
  await chmod(file, 0o644);
  await expect(readTrainingKit(directory, expected, env)).rejects.toThrow(
    /0600/,
  );
  await rm(file);
  const marker = join(directory, "elsewhere");
  await writeFile(marker, JSON.stringify(expected), { mode: 0o600 });
  await symlink(marker, file);
  await expect(readTrainingKit(directory, expected, env)).rejects.toThrow(
    /tidak boleh dibaca/,
  );
});

it("rejects a stale policy fingerprint even when the version matches", async () => {
  const expected = fixtureEnvironment(env);
  await writeFile(
    join(directory, "preflight.json"),
    JSON.stringify({ ...expected, fingerprint: "0".repeat(64) }),
    { mode: 0o600 },
  );
  await expect(readTrainingKit(directory, expected, env)).rejects.toThrow(
    /cap jari polisi berubah/,
  );
});

it("rejects a kit from another session database", async () => {
  const expected = fixtureEnvironment(env);
  await writeFile(
    join(directory, "preflight.json"),
    JSON.stringify({ ...expected, database: "staylink_issue58_previous_test" }),
    { mode: 0o600 },
  );
  await expect(readTrainingKit(directory, expected, env)).rejects.toThrow(
    /pangkalan data lain/,
  );
});
