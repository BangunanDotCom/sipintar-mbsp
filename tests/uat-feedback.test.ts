import { execFile } from "node:child_process";
import {
  mkdtemp,
  readFile,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, expect, it } from "vitest";
import { renderFeedbackReport } from "../scripts/uat-feedback-report";
import {
  entrySchema,
  recordSchema,
  sessionSchema,
  summarizeObservation,
} from "../scripts/uat-feedback-model";

let root: string;
const run = promisify(execFile);
function cli(args: string[], extra = {}) {
  return run(
    process.execPath,
    ["--import", "tsx", "scripts/uat-feedback.ts", ...args],
    {
      env: {
        ...process.env,
        TMPDIR: root,
        NODE_ENV: "test",
        STAYLINK_UAT_FEEDBACK: "true",
        ...extra,
      },
    },
  );
}
const observation = {
  type: "RECORD",
  by: "SYN-FACILITATOR",
  actor: "PIC",
  scenario: "failed-evidence",
  expected: "Bukti latihan gagal menghalang tindakan.",
  actual: "Butang latihan masih dipaparkan.",
  outcome: "FAIL",
  severity: "HIGH",
  reproducibility: "ALWAYS",
  reproductionSteps: "Buka draf latihan dan semak status bukti gagal.",
  evidenceRef: "EV-DEMO-001",
  component: "BUKTI",
  issueRef: "GH-54",
};
const setup = async () =>
  (
    await cli([
      "init",
      "--session",
      "UAT-TEST",
      "--date",
      "2026-11-23",
      "--commit",
      "cb6411b",
    ])
  ).stdout.trim();
async function input(name: string, data: object) {
  const path = join(root, name);
  await writeFile(path, JSON.stringify(data), { mode: 0o600 });
  return path;
}
async function record(directory: string, data: object = observation) {
  return (
    await cli([
      "record",
      "--dir",
      directory,
      "--input",
      await input("new.json", data),
    ])
  ).stdout.trim();
}
const update = (directory: string, id: string, version: number, path: string) =>
  cli([
    "update",
    "--dir",
    directory,
    "--id",
    id,
    "--version",
    String(version),
    "--input",
    path,
  ]);

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "staylink-feedback-test-"));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

it("tracks a defect through assignment, competing edits, fix, independent retest and review", async () => {
  const directory = await setup();
  const id = await record(directory);
  const assign = await input("assign.json", {
    type: "ASSIGN",
    by: "SYN-FACILITATOR",
    team: "ICT",
    assignee: "SYN-FIXER",
  });
  const competing = await Promise.allSettled([
    update(directory, id, 1, assign),
    update(directory, id, 1, assign),
  ]);
  expect(competing.map((result) => result.status).sort()).toEqual([
    "fulfilled",
    "rejected",
  ]);
  const fix = await input("fix.json", {
    type: "FIX",
    by: "SYN-FIXER",
    commit: "1234abc",
    testRef: "tests/e2e/synthetic-portal.spec.ts",
    resolution: "Paparan bukti dikemas kini.",
  });
  await update(directory, id, 2, fix);
  await expect(
    update(
      directory,
      id,
      3,
      await input("own-retest.json", {
        type: "RETEST",
        by: "SYN-FIXER",
        result: "PASS",
        actual: "Semakan latihan lulus.",
        evidenceRef: "EV-RETEST-1",
      }),
    ),
  ).rejects.toMatchObject({ code: 1 });
  await update(
    directory,
    id,
    3,
    await input("retest.json", {
      type: "RETEST",
      by: "SYN-TESTER",
      result: "PASS",
      actual: "Semakan latihan lulus.",
      evidenceRef: "EV-RETEST-1",
    }),
  );
  await expect(
    update(
      directory,
      id,
      4,
      await input("own-review.json", {
        type: "REVIEW",
        by: "SYN-TESTER",
        result: "VERIFIED_INTERNAL",
        note: "Semak rekod latihan.",
      }),
    ),
  ).rejects.toMatchObject({ code: 1 });
  expect(
    (
      await update(
        directory,
        id,
        4,
        await input("review.json", {
          type: "REVIEW",
          by: "SYN-REVIEWER",
          result: "VERIFIED_INTERNAL",
          note: "Bukti latihan lengkap.",
        }),
      )
    ).stdout,
  ).toContain("VERIFIED_INTERNAL");
  await expect(update(directory, id, 5, assign)).rejects.toMatchObject({
    code: 1,
  });
  await record(directory, { ...observation, scenario: "ADD-semakan-khas" });

  const mdPath = (
    await cli(["export", "--dir", directory, "--format", "md"])
  ).stdout.trim();
  const csvPath = (
    await cli(["export", "--dir", directory, "--format", "csv"])
  ).stdout.trim();
  expect((await stat(directory)).mode & 0o777).toBe(0o700);
  for (const path of [mdPath, csvPath]) {
    expect((await stat(path)).mode & 0o777).toBe(0o600);
    const report = await readFile(path, "utf8");
    expect(report).toContain("GH-54");
    expect(report).toContain("EV-RETEST-1");
    expect(report).toContain("1234abc");
    expect(report).toContain("ADD-semakan-khas");
    expect(report).toMatch(/VERIFIED\\?_INTERNAL/);
  }
  const markdown = await readFile(mdPath, "utf8");
  expect(markdown).toContain("district-spt | Belum diuji");
  expect(markdown).toContain("Versi 5");
});

it("fails closed outside test/dev, rejects secret-shaped input and never follows a session symlink", async () => {
  await expect(
    cli(
      [
        "init",
        "--session",
        "UAT-LOCKED",
        "--date",
        "2026-11-23",
        "--commit",
        "cb6411b",
      ],
      {
        NODE_ENV: "production",
      },
    ),
  ).rejects.toMatchObject({ code: 1 });
  await expect(
    cli(
      [
        "init",
        "--session",
        "UAT-LOCKED",
        "--date",
        "2026-11-23",
        "--commit",
        "cb6411b",
      ],
      {
        STAYLINK_UAT_FEEDBACK: "false",
      },
    ),
  ).rejects.toMatchObject({ code: 1 });
  const directory = await setup();
  await expect(
    record(directory, { ...observation, actual: "token: SYN-SECRET-DEMO" }),
  ).rejects.toMatchObject({
    code: 1,
    stderr: expect.not.stringContaining("SYN-SECRET-DEMO"),
  });
  await expect(
    record(directory, { ...observation, evidenceRef: "/tmp/EV-PRIVATE" }),
  ).rejects.toMatchObject({ code: 1 });
  await expect(
    record(directory, { ...observation, actual: "Bukti di sftp://fixture.test" }),
  ).rejects.toMatchObject({ code: 1 });
  const alias = join(root, "staylink-uat-feedback-alias");
  await symlink(directory, alias);
  await expect(
    cli(["export", "--dir", alias, "--format", "md"]),
  ).rejects.toMatchObject({ code: 1 });
});

it("protects report output from spreadsheet evaluation and active markup", () => {
  const session = sessionSchema.parse({
    id: "UAT-TEST",
    dateMyt: "2026-11-23",
    commit: "cb6411b",
  });
  const first = entrySchema.parse({
    at: "2026-11-23T09:00:00.000Z",
    event: recordSchema.parse({
      ...observation,
      expected: "=1+1",
      actual: "<b>Sintetik</b> | latihan",
    }),
  });
  const entries = [first];
  const records = [{ id: "F-DEMO", entries }];
  expect(renderFeedbackReport(session, records, "csv")).toContain('"\'=1+1"');
  const markdown = renderFeedbackReport(session, records, "md");
  expect(markdown).toContain("&lt;b&gt;Sintetik");
  expect(markdown).not.toContain("<b>");
  expect(summarizeObservation(entries).state).toBe("OPEN");
});
