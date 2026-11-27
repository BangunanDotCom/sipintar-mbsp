import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import oracledb, { type Connection } from "oracledb";

const directory = new URL("../../database/oracle/", import.meta.url);
const baselineVersion = "001-baseline";
const completionVersion = "002-completion-audit";
const delegationVersion = "003-delegation-evidence";
type InventoryRow = { type: string; name: string };
const canonical = (entry: InventoryRow) => `${entry.type}:${entry.name}`;

async function namespace(connection: Connection) {
  const { rows } = await connection.execute<{ TYPE: string; NAME: string }>(
    `SELECT OBJECT_TYPE AS TYPE, OBJECT_NAME AS NAME FROM USER_OBJECTS WHERE SUBSTR(OBJECT_NAME,1,4) = 'STL_'
     UNION
     SELECT 'CONSTRAINT', CONSTRAINT_NAME FROM USER_CONSTRAINTS WHERE SUBSTR(CONSTRAINT_NAME,1,4) = 'STL_'`,
    {},
    { outFormat: oracledb.OUT_FORMAT_OBJECT },
  );
  return new Set(
    rows!.map(({ TYPE, NAME }) => canonical({ type: TYPE, name: NAME })),
  );
}

async function preflight(connection: Connection) {
  const { rows } = await connection.execute<{ PRIVILEGE: string }>(
    `SELECT PRIVILEGE FROM SESSION_PRIVS WHERE PRIVILEGE IN ('CREATE SESSION','CREATE TABLE','CREATE VIEW','CREATE TRIGGER','UNLIMITED TABLESPACE')`,
    {},
    { outFormat: oracledb.OUT_FORMAT_OBJECT },
  );
  const required = new Set(rows!.map(({ PRIVILEGE }) => PRIVILEGE));
  if (
    !["CREATE SESSION", "CREATE TABLE", "CREATE VIEW", "CREATE TRIGGER"].every(
      (value) => required.has(value),
    )
  )
    throw Error("Keistimewaan pemasangan Oracle tidak lengkap.");
  const quota = await connection.execute<{ REMAINING: number }>(
    `SELECT CASE WHEN Q.MAX_BYTES = -1 THEN 1 ELSE Q.MAX_BYTES - Q.BYTES END AS REMAINING
       FROM USER_TS_QUOTAS Q JOIN USER_USERS U ON Q.TABLESPACE_NAME = U.DEFAULT_TABLESPACE`,
    {},
    { outFormat: oracledb.OUT_FORMAT_OBJECT },
  );
  if (
    !required.has("UNLIMITED TABLESPACE") &&
    (quota.rows?.[0]?.REMAINING ?? 0) <= 0
  )
    throw Error("Kuota tablespace lalai diperlukan.");
}

type Migration = {
  version: string;
  checksum: string;
  expected: Set<string>;
  statements: string[];
};

async function loadMigration(
  version: string,
  historyDdl = "",
): Promise<Migration> {
  const ddl = await readFile(new URL(`${version}.sql`, directory), "utf8");
  const inventorySource = await readFile(
    new URL(`${version.slice(0, 3)}-inventory.json`, directory),
    "utf8",
  );
  const inventory: InventoryRow[] = JSON.parse(inventorySource);
  const checksum = createHash("sha256")
    .update(ddl)
    .update(inventorySource)
    .update(historyDdl)
    .digest("hex");
  const statements = ddl
    .split(/^-- @statement\s*$/m)
    .map((step) => step.replace(/^--[^\n]*\n/, "").trim());
  if (
    statements.some(
      (step) =>
        !/^(?:(?:CREATE (?:UNIQUE )?(?:TABLE|INDEX|VIEW|TRIGGER))|ALTER TABLE) STL_[A-Z0-9_]+\b/.test(
          step,
        ),
    )
  )
    throw Error("DDL di luar skop STL.");
  return {
    version,
    checksum,
    statements,
    expected: new Set(inventory.map(canonical)),
  };
}

async function validate(connection: Connection, expected: Set<string>) {
  const objects = await namespace(connection);
  const missing = [...expected].filter((key) => !objects.has(key));
  const unexpected = [...objects].filter((key) => !expected.has(key));
  if (missing.length || unexpected.length)
    throw Error(
      `Inventori Oracle tidak sepadan. Hilang: ${missing.length}; luar manifest: ${unexpected.length}.`,
    );
  const options = { outFormat: oracledb.OUT_FORMAT_OBJECT };
  const states = await connection.execute<{ N: number }>(
    `SELECT COUNT(*) AS N FROM USER_OBJECTS WHERE SUBSTR(OBJECT_NAME,1,4) = 'STL_' AND STATUS <> 'VALID'`,
    {},
    options,
  );
  const disabled = await connection.execute<{ N: number }>(
    `SELECT COUNT(*) AS N FROM USER_TRIGGERS WHERE SUBSTR(TRIGGER_NAME,1,4) = 'STL_' AND STATUS <> 'ENABLED'`,
    {},
    options,
  );
  if (states.rows?.[0]?.N || disabled.rows?.[0]?.N)
    throw Error("Objek Oracle tidak sah atau pencetus STL dinyahaktifkan.");
  if (expected.has("INDEX:STL_IX_COMPLETION_AUDIT")) {
    const result = await connection.execute<{ COLUMN_NAME: string }>(
      `SELECT COLUMN_NAME FROM USER_IND_COLUMNS WHERE INDEX_NAME='STL_IX_COMPLETION_AUDIT'
        AND TABLE_NAME='STL_AUDIT_LOGS' ORDER BY COLUMN_POSITION`,
      {},
      options,
    );
    if (
      result.rows?.map(({ COLUMN_NAME }) => COLUMN_NAME).join(",") !==
      "ACTION,TARGET,OUTCOME"
    )
      throw Error("Definisi indeks audit penyelesaian Oracle tidak sepadan.");
  }
}

async function applyMigration(
  connection: Connection,
  migration: Migration,
  expected: Set<string>,
) {
  const { version, checksum } = migration;
  await connection.execute(
    "INSERT INTO STL_SCHEMA_MIGRATIONS (VERSION,CHECKSUM,STATE) VALUES (:version,:checksum,'APPLYING')",
    { version, checksum },
  );
  await connection.commit(); // DDL implicitly commits. Preserve the marker on any failure.
  for (const [index, statement] of migration.statements.entries()) {
    try {
      await connection.execute(statement);
    } catch (error) {
      const code =
        error instanceof Error && "code" in error
          ? String(error.code)
          : "UNKNOWN";
      throw Error(
        `DDL ${version} langkah ${index + 1} gagal (${/^ORA-\d+$/.test(code) ? code : "UNKNOWN"}). Sejarah kekal APPLYING.`,
      );
    }
  }
  await validate(connection, expected);
  await connection.execute(
    "UPDATE STL_SCHEMA_MIGRATIONS SET STATE='APPLIED', APPLIED_AT=SYSTIMESTAMP WHERE VERSION=:version AND STATE='APPLYING'",
    { version },
  );
  await connection.commit();
}

export async function migrateOracle(connection: Connection, apply: boolean) {
  await preflight(connection);
  const historyDdl = await readFile(
    new URL("000-history.sql", directory),
    "utf8",
  );
  const baseline = await loadMigration(baselineVersion, historyDdl);
  const completion = await loadMigration(completionVersion);
  for (const name of [
    "TABLE:STL_SCHEMA_MIGRATIONS",
    "INDEX:STL_HIST_PK",
    ...[
      "VERSION_NN",
      "CHECKSUM_NN",
      "STATE_NN",
      "START_NN",
      "PK",
      "STATE_CK",
    ].map((suffix) => `CONSTRAINT:STL_HIST_${suffix}`),
  ])
    baseline.expected.add(name);
  const delegation = await loadMigration(delegationVersion);
  const core = await loadMigration("004-core-journals");
  const caseAudit = await loadMigration("005-audit-case-lookup");
  const caseReminders = await loadMigration("006-training-case-reminders");
  const reminderWidth = await loadMigration("007-reminder-kind-width");
  const migrations = [
    baseline,
    completion,
    delegation,
    core,
    caseAudit,
    caseReminders,
    reminderWidth,
  ];
  const inventoryThrough = (count: number) => {
    const expected = new Set(
      migrations.slice(0, count).flatMap(({ expected }) => [...expected]),
    );
    if (count >= 6) expected.delete("CONSTRAINT:STL_CK_TR_KIND");
    return expected;
  };
  const existing = await namespace(connection);
  if (!existing.size) {
    if (!apply) return "EMPTY";
    await connection.execute(historyDdl.trim());
    for (const [index, migration] of migrations.entries())
      await applyMigration(connection, migration, inventoryThrough(index + 1));
    return "APPLIED";
  }
  if (!existing.has("TABLE:STL_SCHEMA_MIGRATIONS"))
    throw Error("Pertindihan objek STL dikesan sebelum DDL.");
  let history:
    { VERSION: string; CHECKSUM: string; STATE: string }[] | undefined =
    undefined;
  try {
    ({ rows: history } = await connection.execute<{
      VERSION: string;
      CHECKSUM: string;
      STATE: string;
    }>(
      "SELECT VERSION,CHECKSUM,STATE FROM STL_SCHEMA_MIGRATIONS ORDER BY VERSION FETCH FIRST 8 ROWS ONLY",
      {},
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    ));
  } catch {
    throw Error("Jadual sejarah bertindih atau tidak sepadan.");
  }
  if (
    !history?.length ||
    history.length > migrations.length ||
    history.some((row, index) => {
      const migration = migrations[index];
      return (
        row.VERSION !== migration.version ||
        row.CHECKSUM !== migration.checksum ||
        row.STATE !== "APPLIED"
      );
    })
  )
    throw Error(
      "Sejarah tidak sepadan atau DDL separa. Hentikan pemasangan untuk semakan pemulihan.",
    );
  await validate(connection, inventoryThrough(history.length));
  if (apply)
    for (const [offset, migration] of migrations
      .slice(history.length)
      .entries())
      await applyMigration(
        connection,
        migration,
        inventoryThrough(history.length + offset + 1),
      );
  return "APPLIED";
}
