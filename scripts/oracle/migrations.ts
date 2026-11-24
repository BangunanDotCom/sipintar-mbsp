import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import oracledb, { type Connection } from "oracledb";

const directory = new URL("../../database/oracle/", import.meta.url);
const version = "001-baseline";
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

export async function migrateOracle(connection: Connection, apply: boolean) {
  await preflight(connection);
  const ddl = await readFile(new URL(`${version}.sql`, directory), "utf8");
  const inventorySource = await readFile(
    new URL("001-inventory.json", directory),
    "utf8",
  );
  const inventory: InventoryRow[] = JSON.parse(inventorySource);
  const historyDdl = await readFile(
    new URL("000-history.sql", directory),
    "utf8",
  );
  const checksum = createHash("sha256")
    .update(ddl)
    .update(inventorySource)
    .update(historyDdl)
    .digest("hex");
  const expected = new Set(inventory.map(canonical));
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
    expected.add(name);
  const validate = async () => {
    const objects = await namespace(connection);
    const missing = [...expected].filter((key) => !objects.has(key));
    const unexpected = [...objects].filter((key) => !expected.has(key));
    if (missing.length || unexpected.length)
      throw Error(
        `Inventori Oracle tidak sepadan. Hilang: ${missing.length}; luar manifest: ${unexpected.length}.`,
      );
    const states = await connection.execute<{ N: number }>(
      `SELECT COUNT(*) AS N FROM USER_OBJECTS WHERE SUBSTR(OBJECT_NAME,1,4) = 'STL_' AND STATUS <> 'VALID'`,
      {},
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    const disabled = await connection.execute<{ N: number }>(
      `SELECT COUNT(*) AS N FROM USER_TRIGGERS WHERE SUBSTR(TRIGGER_NAME,1,4) = 'STL_' AND STATUS <> 'ENABLED'`,
      {},
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    if (states.rows?.[0]?.N || disabled.rows?.[0]?.N)
      throw Error("Objek Oracle tidak sah atau pencetus STL dinyahaktifkan.");
  };
  const existing = await namespace(connection);
  if (existing.size) {
    if (!existing.has("TABLE:STL_SCHEMA_MIGRATIONS"))
      throw Error("Pertindihan objek STL dikesan sebelum DDL.");
    let rows:
      { VERSION: string; CHECKSUM: string; STATE: string }[] | undefined;
    try {
      ({ rows } = await connection.execute<{
        VERSION: string;
        CHECKSUM: string;
        STATE: string;
      }>(
        "SELECT VERSION,CHECKSUM,STATE FROM STL_SCHEMA_MIGRATIONS FETCH FIRST 2 ROWS ONLY",
        {},
        { outFormat: oracledb.OUT_FORMAT_OBJECT },
      ));
    } catch {
      throw Error("Jadual sejarah bertindih atau tidak sepadan.");
    }
    if (
      rows?.length !== 1 ||
      rows[0].VERSION !== version ||
      rows[0].STATE !== "APPLIED" ||
      rows[0].CHECKSUM !== checksum
    )
      throw Error(
        "Sejarah tidak sepadan atau DDL separa. Hentikan pemasangan untuk semakan pemulihan.",
      );
    await validate();
    return "APPLIED";
  }
  if (!apply) return "EMPTY";
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
  await connection.execute(historyDdl.trim());
  await connection.execute(
    "INSERT INTO STL_SCHEMA_MIGRATIONS (VERSION,CHECKSUM,STATE) VALUES (:version,:checksum,'APPLYING')",
    { version, checksum },
  );
  await connection.commit(); // Oracle DDL implicitly commits. This durable marker is never cleared on error.
  for (const [index, statement] of statements.entries()) {
    try {
      await connection.execute(statement);
    } catch (error) {
      const code =
        error instanceof Error && "code" in error
          ? String(error.code)
          : "UNKNOWN";
      throw Error(
        `DDL langkah ${index + 1} gagal (${/^ORA-\d+$/.test(code) ? code : "UNKNOWN"}). Sejarah kekal APPLYING.`,
      );
    }
  }
  await validate();
  await connection.execute(
    "UPDATE STL_SCHEMA_MIGRATIONS SET STATE='APPLIED', APPLIED_AT=SYSTIMESTAMP WHERE VERSION=:version AND STATE='APPLYING'",
    { version },
  );
  await connection.commit();
  return "APPLIED";
}
