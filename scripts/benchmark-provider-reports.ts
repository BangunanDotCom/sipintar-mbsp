import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { parse } from "dotenv";
import { buildApp, buildOracleLabApp } from "../apps/api/src/app.js";
import { postgresAuth } from "../apps/api/src/auth-repository.js";
import { db, hash } from "../apps/api/src/core.js";
import { oracleConfig } from "../apps/api/src/oracle/config.js";
import { createOraclePool } from "../apps/api/src/oracle/pool.js";
import { createOracleRepositories } from "../apps/api/src/oracle/provider.js";

const provider = process.argv[2];
const lab = "staylink_issue62_personal_completionbench_test";
const pgUrl =
  provider === "postgresql"
    ? new URL(process.env.TEST_DATABASE_URL ?? "")
    : null;
if (
  process.env.STAYLINK_BENCH_REPORTS !== "true" ||
  !["oracle", "postgresql"].includes(provider) ||
  (pgUrl &&
    (pgUrl.hostname !== "127.0.0.1" ||
      pgUrl.pathname !== "/" + lab ||
      pgUrl.href !== process.env.DATABASE_URL ||
      pgUrl.search ||
      pgUrl.hash))
)
  throw Error("A dedicated synthetic report benchmark lab is required.");

const owner =
  provider === "oracle"
    ? oracleConfig(
        parse(
          await readFile(process.env.STAYLINK_BENCH_ORACLE_OWNER_ENV ?? ""),
        ),
        "install",
      )
    : null;
const runtime =
  provider === "oracle" ? oracleConfig(process.env, "runtime") : null;
if (
  owner &&
  (owner.owner !== "STL_LAB_FP_BENCH" || runtime?.owner !== owner.owner)
)
  throw Error("A dedicated Oracle benchmark schema is required.");

const ownerPool = owner && (await createOraclePool(owner));
const runtimePool = runtime && (await createOraclePool(runtime));
const repositories = runtimePool && createOracleRepositories(runtimePool);
const auth = repositories ? repositories.auth : postgresAuth;
const kit = JSON.parse(
  await readFile(process.env.STAYLINK_COMPLETION_KIT_FILE ?? "", "utf8"),
) as {
  accounts: { label: string; email: string }[];
};
const applicant = await auth.findUser(
  kit.accounts.find(({ label }) => label === "pemohon")!.email,
);
const officer = await auth.findUser(
  kit.accounts.find(({ label }) => label === "ppsk")!.email,
);
if (
  !applicant ||
  !officer ||
  ![applicant, officer].every(({ email }) => email.endsWith("@example.test")) ||
  officer.id !== process.env.STAYLINK_SYNTHETIC_SUPERVISOR_ID
)
  throw Error("Synthetic fixture users do not match the benchmark scope.");

const category = "stl-bench-" + randomUUID();
const snapshot = {
  capacity: "INDIVIDUAL",
  companyId: null,
  districtId: "SPU",
  buildingType: category,
};
const raw = randomUUID();
const volumes = [
  { size: 100, day: "2026-07-01" },
  { size: 1000, day: "2026-07-02" },
  { size: 5000, day: "2026-07-03" },
];

try {
  for (const [index, { size, day }] of volumes.entries()) {
    const createdAt = new Date(day + "T12:00:00Z");
    const batch = Array.from(
      { length: size - (volumes[index - 1]?.size ?? 0) },
      () => ({
        id: randomUUID(),
        draftId: randomUUID(),
        actorId: applicant.id,
      }),
    );
    if (ownerPool) {
      await ownerPool.transaction(async (connection) => {
        await connection.executeMany(
          `INSERT INTO STL_APPLICATION_DRAFTS
          (ID,INITIATED_BY_USER_ID,CAPACITY,OFFICIAL_APPLICANT_USER_ID,INITIATOR_SNAPSHOT,APPLICANT_SNAPSHOT,UPDATED_AT)
          VALUES (:draftId,:actorId,'INDIVIDUAL',:actorId,'{}','{}',SYSTIMESTAMP)`,
          batch.map(({ draftId, actorId }) => ({ draftId, actorId })),
        );
        // One compact fixture event per case lets both engines exercise grouping
        // and report serialization with the same cardinality.
        const date = createdAt
          .toISOString()
          .replace("T", " ")
          .replace("Z", " +00:00");
        await connection.executeMany(
          `INSERT INTO STL_SYNTHETIC_SUBMISSIONS
          (ID,DRAFT_ID,DRAFT_VERSION,KEY,ACTOR_ID,DECLARATION_VERSION,POLICY_VERSION,SNAPSHOT,CREATED_AT)
          VALUES (:id,:draftId,1,:id,:actorId,'LAB','SYNTHETIC-BENCH',:snapshot,
            TO_TIMESTAMP_TZ(:stamp,'YYYY-MM-DD HH24:MI:SS.FF3 TZH:TZM'))`,
          batch.map((row) => ({
            ...row,
            snapshot: JSON.stringify(snapshot),
            stamp: date,
          })),
        );
        await connection.executeMany(
          `INSERT INTO STL_AUDIT_LOGS (ID,ACTION,TARGET)
          VALUES (:id,'SYNTHETIC_PORTAL_REGISTERED',:target)`,
          batch.map(({ id }) => ({ id: randomUUID(), target: id })),
        );
      });
    } else {
      for (let start = 0; start < batch.length; start += 250) {
        const rows = batch.slice(start, start + 250);
        await db.$transaction([
          db.applicationDraft.createMany({
            data: rows.map(({ draftId, actorId }) => ({
              id: draftId,
              initiatedByUserId: actorId,
              officialApplicantUserId: actorId,
              initiatorSnapshot: {},
              applicantSnapshot: {},
              capacity: "INDIVIDUAL",
            })),
          }),
          db.syntheticSubmission.createMany({
            data: rows.map((row) => ({
              ...row,
              key: row.id,
              draftVersion: 1,
              declarationVersion: "LAB",
              policyVersion: "SYNTHETIC-BENCH",
              snapshot,
              createdAt,
            })),
          }),
          db.auditLog.createMany({
            data: rows.map(({ id }) => ({
              action: "SYNTHETIC_PORTAL_REGISTERED",
              target: id,
            })),
          }),
        ]);
      }
    }
  }
  await auth.createSession({
    id: hash(raw),
    userId: officer.id,
    csrfHash: hash(randomUUID()),
    expiresAt: new Date(Date.now() + 600_000),
    mfaVerified: true,
  });
  await auth.switchRole(hash(raw), "PPSK");
  const app = repositories
    ? await buildOracleLabApp(repositories)
    : await buildApp();
  try {
    for (const { size, day } of volumes) {
      const request = () =>
        app.inject({
          url:
            "/api/synthetic-portal/reports/applications?" +
            new URLSearchParams({ category, to: day }),
          headers: { cookie: "staylink=" + raw },
        });
      const warm = await request();
      if (warm.statusCode !== 200 || warm.json().rows[0]?.cases !== size)
        throw Error("Unexpected warmup count or status " + warm.statusCode);
      const sample: number[] = [];
      const status: Record<number, number> = {};
      let peakPoolInUse = 0,
        peakPoolOpen = 0,
        peakLockWaitSamples = 0;
      for (let i = 0; i < 7; i++) {
        const wave = Promise.all(
          Array.from({ length: 3 }, async () => {
            const start = performance.now();
            const result = await request();
            status[result.statusCode] = (status[result.statusCode] ?? 0) + 1;
            if (result.statusCode === 200) {
              if (result.json().rows[0]?.cases !== size)
                throw Error("Benchmark fixture count diverged.");
              sample.push(performance.now() - start);
            }
          }),
        );
        await new Promise((resolve) => setTimeout(resolve, 15));
        if (runtimePool) {
          const pool = runtimePool.connections();
          peakPoolInUse = Math.max(peakPoolInUse, pool.inUse);
          peakPoolOpen = Math.max(peakPoolOpen, pool.open);
        } else {
          const [activity] = await db.$queryRaw<
            { active: number; total: number; locks: number }[]
          >`
            SELECT count(*) FILTER (WHERE state IN ('active','idle in transaction'))::integer AS active,
              count(*)::integer AS total,
              count(*) FILTER (WHERE wait_event_type='Lock')::integer AS locks
            FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid()
          `;
          peakPoolInUse = Math.max(peakPoolInUse, activity.active);
          peakPoolOpen = Math.max(peakPoolOpen, activity.total);
          peakLockWaitSamples = Math.max(peakLockWaitSamples, activity.locks);
        }
        await wave;
      }
      sample.sort((a, b) => a - b);
      const percentile = (p: number) =>
        Math.round(sample[Math.ceil(sample.length * p) - 1]);
      console.log(
        JSON.stringify({
          provider,
          size,
          concurrency: 3,
          status,
          p50Ms: percentile(0.5),
          p95Ms: percentile(0.95),
          p99Ms: percentile(0.99),
          peakPoolInUse,
          peakPoolOpen,
          sampledDbLockWaits: runtimePool ? null : peakLockWaitSamples,
        }),
      );
    }
  } finally {
    await app.close();
  }
} finally {
  await auth.logout(hash(raw));
  await Promise.all([
    ownerPool && ownerPool.close(),
    runtimePool && runtimePool.close(),
    db.$disconnect(),
  ]);
}
