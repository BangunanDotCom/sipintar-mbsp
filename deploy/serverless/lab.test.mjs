import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { readFile } from "node:fs/promises";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { readPersonalDraft, requestCorrection } from "./repository.mjs";

const migration = await readFile(new URL("migrations/0001_lab.sql", import.meta.url), "utf8");
const seed = await readFile(new URL("seed-lab.sql", import.meta.url), "utf8");
const config = JSON.parse(await readFile(new URL("wrangler.jsonc", import.meta.url), "utf8"));
let machine;
let db;
const officer = (userId, mfaVerified = true) => ({ userId, mfaVerified });

async function applySql(sql) {
  // The checked-in SQL uses a blank line between top-level statements. Trigger bodies stay intact.
  const statements = sql.split(/;\s*(?:\n\s*\n|$)/).map((statement) => statement.trim()).filter(Boolean);
  await db.batch(statements.map((statement) => db.prepare(statement)));
}

beforeEach(async () => {
  machine = new Miniflare(convertV4MiniflareOptions({
    modules: true,
    scriptPath: new URL("worker.mjs", import.meta.url).pathname,
    compatibilityDate: config.compatibility_date,
    d1Databases: { DB: config.d1_databases[0].database_id },
  }));
  db = await machine.getD1Database("DB");
  await applySql(migration);
  await applySql(seed);
});

afterEach(async () => {
  await machine?.dispose();
});

async function state(draftId = "single-unit") {
  return db.prepare("SELECT status,version FROM stl_lab_drafts WHERE id=?").bind(draftId).first();
}

async function auditCount() {
  return db.prepare("SELECT count(*) AS n FROM stl_lab_audit").first("n");
}

test("the Worker rejects portal and API traffic, with public bindings disabled", async () => {
  assert.equal(config.workers_dev, false);
  assert.equal(config.preview_urls, false);
  assert.equal(config.d1_databases[0].remote, false);
  for (const path of ["/", "/assets/a.js", "/dashboard", "/api/auth/login", "/api/application-drafts/single-unit"]) {
    const response = await machine.dispatchFetch("http://127.0.0.1" + path, {
      method: path.startsWith("/api") ? "POST" : "GET",
    });
    assert.equal(response.status, 503);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.equal(response.headers.get("set-cookie"), null);
  }
});

test("the seed has six role identities and six scenario anchors", async () => {
  await applySql(seed);
  assert.equal(await db.prepare("SELECT count(*) n FROM stl_lab_accounts").first("n"), 6);
  assert.equal(await db.prepare("SELECT count(*) n FROM stl_lab_drafts").first("n"), 6);
  assert.equal(await auditCount(), 0);
});

test("the personal read scopes by owner and current account status", async () => {
  const fixture = await readPersonalDraft(db, { userId: "pemohon" }, "single-unit");
  assert.deepEqual(fixture, { id: "single-unit", version: 1, status: "SUBMITTED" });
  assert.equal(await readPersonalDraft(db, { userId: "wakil" }, "single-unit"), null);
  assert.equal(await readPersonalDraft(db, { userId: "pentadbir" }, "single-unit"), null);
  await db.prepare("UPDATE stl_lab_accounts SET active=0 WHERE id=?").bind("pemohon").run();
  assert.equal(await readPersonalDraft(db, { userId: "pemohon" }, "single-unit"), null);
});

test("the correction refuses cross-district, wrong role, missing MFA and inactive accounts", async () => {
  assert.equal(await requestCorrection(db, officer("pic-spt"), "single-unit", 1, "cross"), null);
  assert.equal(await requestCorrection(db, officer("pic-spu"), "district-spt", 1, "cross"), null);
  assert.equal(await requestCorrection(db, officer("ppsk"), "single-unit", 1, "role"), null);
  assert.equal(await requestCorrection(db, officer("pic-spu", false), "single-unit", 1, "mfa"), null);
  await db.prepare("UPDATE stl_lab_accounts SET active=0 WHERE id=?").bind("pic-spu").run();
  assert.equal(await requestCorrection(db, officer("pic-spu"), "single-unit", 1, "revoked"), null);
  assert.deepEqual(await state(), { status: "SUBMITTED", version: 1 });
  assert.equal(await auditCount(), 0);
});

test("a valid PIC receives a single audited receipt, even across a concurrent replay", async () => {
  const actor = officer("pic-spu");
  const [first, replay] = await Promise.all([
    requestCorrection(db, actor, "single-unit", 1, "once"),
    requestCorrection(db, actor, "single-unit", 1, "once"),
  ]);
  assert.deepEqual(first, { draft_id: "single-unit", next_version: 2, action: "REQUEST_CORRECTION" });
  assert.deepEqual(replay, first);
  assert.deepEqual(await state(), { status: "CORRECTION_REQUESTED", version: 2 });
  assert.equal(await requestCorrection(db, actor, "single-unit", 1, "another"), null);
  assert.equal(await requestCorrection(db, actor, "single-unit", 2, "once"), null);
  assert.equal(await requestCorrection(db, actor, "district-spt", 1, "once"), null);
  assert.equal(await auditCount(), 1);
  await assert.rejects(db.prepare("DELETE FROM stl_lab_audit WHERE request_key=?").bind("once").run(), /immutable/);
  await assert.rejects(db.prepare("UPDATE stl_lab_audit SET action=? WHERE request_key=?").bind("REQUEST_CORRECTION", "once").run(), /immutable/);
});

test("failed audit storage rolls back the whole correction", async () => {
  await db.prepare(`
    CREATE TRIGGER stl_lab_fixture_reject BEFORE INSERT ON stl_lab_audit
    BEGIN
      SELECT RAISE(ABORT, 'fixture rejects audit write');
    END
  `).run();
  await assert.rejects(requestCorrection(db, officer("pic-spu"), "single-unit", 1, "failed"), /fixture rejects audit write/);
  assert.deepEqual(await state(), { status: "SUBMITTED", version: 1 });
  assert.equal(await auditCount(), 0);
});
