import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import oracledb, { type BindParameters, type Connection } from "oracledb";
import type { OraclePool } from "../../apps/api/src/oracle/pool.js";
import { queryRows } from "../../apps/api/src/oracle/query.js";
import { migrateOracle } from "./migrations.js";

const manifest = new URL(
  "../../database/oracle/001-inventory.json",
  import.meta.url,
);
const format = "stl-oracle-lab-001";
const instantFormat = 'YYYY-MM-DD"T"HH24:MI:SS.FF6';
const dateFormat = 'YYYY-MM-DD"T"HH24:MI:SS';
type Column = { COLUMN_NAME: string; DATA_TYPE: string };
type Row = (string | null)[];
export type TableData = { name: string; columns: string[]; rows: Row[] };
type Snapshot = { format: string; source: string; tables: TableData[] };

export async function snapshotTables(connection: Connection) {
  const inventory = (
    await Promise.all(
      [
        manifest,
        new URL("../../database/oracle/004-inventory.json", import.meta.url),
      ].map(async (url) => JSON.parse(await readFile(url, "utf8"))),
    )
  ).flat() as {
    type: string;
    name: string;
  }[];
  const allColumns = await queryRows<Column & { TABLE_NAME: string }>(
    connection,
    `SELECT TABLE_NAME,COLUMN_NAME,DATA_TYPE FROM USER_TAB_COLUMNS
      WHERE SUBSTR(TABLE_NAME,1,4)='STL_' ORDER BY TABLE_NAME,COLUMN_ID`,
    {},
  );
  const allKeys = await queryRows<{ TABLE_NAME: string; COLUMN_NAME: string }>(
    connection,
    `SELECT C.TABLE_NAME,X.COLUMN_NAME FROM USER_CONSTRAINTS C JOIN USER_CONS_COLUMNS X
      ON C.CONSTRAINT_NAME=X.CONSTRAINT_NAME WHERE C.CONSTRAINT_TYPE='P'
      AND SUBSTR(C.TABLE_NAME,1,4)='STL_' ORDER BY C.TABLE_NAME,X.POSITION`,
    {},
  );
  return inventory
    .filter(
      ({ type, name }) =>
        type === "TABLE" && allColumns.some((row) => row.TABLE_NAME === name),
    )
    .map(({ name }) => {
      const columns = allColumns.filter((item) => item.TABLE_NAME === name);
      const primaryKey = allKeys
        .filter((item) => item.TABLE_NAME === name)
        .map((item) => item.COLUMN_NAME);
      if (
        !/^STL_[A-Z0-9_]{1,26}$/.test(name) ||
        !columns.length ||
        !primaryKey.length ||
        columns.some(
          ({ COLUMN_NAME }) => !/^[A-Z][A-Z0-9_]{0,29}$/.test(COLUMN_NAME),
        )
      )
        throw Error("Metadata jadual STL sandaran tidak sah.");
      return { name, columns, primaryKey };
    });
}

function selectValue({ COLUMN_NAME: name, DATA_TYPE: type }: Column) {
  switch (type) {
    case "TIMESTAMP(6) WITH TIME ZONE":
      return `TO_CHAR(SYS_EXTRACT_UTC(${name}),'${instantFormat}')`;
    case "DATE":
      return `TO_CHAR(${name},'${dateFormat}')`;
    case "NUMBER":
      return `TO_CHAR(${name},'TM9')`;
    case "BINARY_DOUBLE":
    case "VARCHAR2":
    case "CLOB":
    case "BLOB":
      return name;
    default:
      throw Error("Jenis kolum Oracle sandaran belum disokong.");
  }
}

type Table = Awaited<ReturnType<typeof snapshotTables>>[number];
async function readTable(
  connection: Connection,
  table: Table,
): Promise<TableData> {
  const { name, columns, primaryKey } = table;
  const emptyLobs = columns.flatMap(({ COLUMN_NAME, DATA_TYPE }, index) =>
    DATA_TYPE === "CLOB" || DATA_TYPE === "BLOB"
      ? [
          {
            index,
            expression: `CASE WHEN DBMS_LOB.GETLENGTH(${COLUMN_NAME})=0 THEN 1 ELSE 0 END`,
          },
        ]
      : [],
  );
  const select = [
    ...columns.map(selectValue),
    ...emptyLobs.map(({ expression }) => expression),
  ].join(",");
  // Insert parents before corrections, even when a restored ID sorts earlier.
  const correction = name === "STL_SYNTHETIC_SUBMISSIONS";
  const order = correction
    ? "START WITH PREVIOUS_ID IS NULL CONNECT BY NOCYCLE PRIOR ID=PREVIOUS_ID AND PRIOR DRAFT_ID=DRAFT_ID ORDER SIBLINGS BY ID"
    : `ORDER BY ${primaryKey.join(",")}`;
  const { rows = [] } = await connection.execute<
    (string | number | Buffer | null)[]
  >(
    `SELECT ${select} FROM ${name} ${order}`,
    {},
    {
      outFormat: oracledb.OUT_FORMAT_ARRAY,
      fetchTypeHandler: ({ dbType }) => {
        if (dbType === oracledb.DB_TYPE_CLOB) return { type: oracledb.STRING };
        if (dbType === oracledb.DB_TYPE_BLOB) return { type: oracledb.BUFFER };
      },
    },
  );
  if (correction) {
    const [{ N }] = await queryRows<{ N: number }>(
      connection,
      `SELECT COUNT(*) N FROM ${name}`,
      {},
    );
    if (rows.length !== N)
      throw Error("Rantaian pembetulan Oracle tidak lengkap.");
  }
  return {
    name,
    columns: columns.map(({ COLUMN_NAME }) => COLUMN_NAME),
    rows: rows.map((row) => {
      const values = row
        .slice(0, columns.length)
        .map((value) =>
          Buffer.isBuffer(value)
            ? value.toString("base64")
            : typeof value === "number"
              ? String(value)
              : value,
        );
      for (const [offset, { index }] of emptyLobs.entries())
        if (row[columns.length + offset] === 1) values[index] = "";
      return values;
    }),
  };
}

function insertValue(type: string, bind: string, value: string | null): string {
  switch (type) {
    case "TIMESTAMP(6) WITH TIME ZONE":
      return `FROM_TZ(TO_TIMESTAMP(${bind},'${instantFormat}'),'UTC')`;
    case "DATE":
      return `TO_DATE(${bind},'${dateFormat}')`;
    case "NUMBER":
      return `CAST(${bind} AS NUMBER)`;
    case "BINARY_DOUBLE":
      return bind;
    case "CLOB":
      return value === "" ? "EMPTY_CLOB()" : bind;
    case "BLOB":
      return value === "" ? "EMPTY_BLOB()" : bind;
    case "VARCHAR2":
      return bind;
    default:
      throw Error("Jenis kolum Oracle pemulihan belum disokong.");
  }
}

async function restoreTable(
  connection: Connection,
  table: Table,
  data: TableData,
) {
  const { name, columns } = table;
  if (
    name !== data.name ||
    JSON.stringify(columns.map((item) => item.COLUMN_NAME)) !==
      JSON.stringify(data.columns) ||
    !Array.isArray(data.rows)
  )
    throw Error("Jadual dalam sandaran Oracle tidak sepadan.");
  for (const row of data.rows) {
    if (
      !Array.isArray(row) ||
      row.length !== columns.length ||
      row.some((value) => value !== null && typeof value !== "string")
    )
      throw Error("Baris dalam sandaran Oracle tidak sah.");
    const binds: BindParameters = {};
    const expressions = row.map((value, index) => {
      const { DATA_TYPE: type } = columns[index];
      const key = `value${index}`;
      const bind = `:${key}`;
      const expression = insertValue(type, bind, value);
      if (expression !== "EMPTY_CLOB()" && expression !== "EMPTY_BLOB()") {
        if (type === "BLOB") {
          const val = value === null ? null : Buffer.from(value, "base64");
          if (val && val.toString("base64") !== value)
            throw Error("BLOB sandaran tidak sah.");
          binds[key] = { type: oracledb.BLOB, val };
        } else if (type === "BINARY_DOUBLE") {
          const val = value === null ? null : Number(value);
          if (val !== null && !Number.isFinite(val))
            throw Error("Koordinat sandaran tidak sah.");
          binds[key] = { type: oracledb.DB_TYPE_BINARY_DOUBLE, val };
        } else {
          binds[key] = {
            type: type === "CLOB" ? oracledb.CLOB : oracledb.STRING,
            val: value,
          };
        }
      }
      return expression;
    });
    await connection.execute(
      `INSERT INTO ${name} (${data.columns.join(",")}) VALUES (${expressions.join(",")})`,
      binds,
    );
  }
}

const digest = (data: TableData[]) =>
  createHash("sha256").update(JSON.stringify(data)).digest("hex");

export function assembleOracleSnapshot(source: string, data: TableData[]) {
  const snapshot: Snapshot = { format, source, tables: data };
  return { snapshot, checksum: digest(data) };
}

async function prepareSession(connection: Connection) {
  if ((await migrateOracle(connection, false)) !== "APPLIED")
    throw Error("Skema sandaran Oracle belum disediakan.");
  await connection.execute(
    "ALTER SESSION SET NLS_NUMERIC_CHARACTERS='.,' NLS_SORT=BINARY NLS_CALENDAR='GREGORIAN'",
  );
}

export async function exportOracleSnapshot(pool: OraclePool) {
  return pool.transaction(async (connection) => {
    await prepareSession(connection);
    await connection.execute("SET TRANSACTION READ ONLY");
    const data: TableData[] = [];
    for (const table of await snapshotTables(connection))
      data.push(await readTable(connection, table));
    return assembleOracleSnapshot(pool.owner, data);
  });
}

export async function restoreOracleSnapshot(
  pool: OraclePool,
  input: Awaited<ReturnType<typeof exportOracleSnapshot>>,
) {
  const { snapshot, checksum } = input;
  if (
    snapshot?.format !== format ||
    !/^(?:STL_LAB_[A-Z][A-Z0-9_]{0,19}|POSTGRESQL:staylink_[a-z0-9_]{1,35}_test)$/.test(
      snapshot.source,
    ) ||
    snapshot.source === pool.owner ||
    !Array.isArray(snapshot.tables) ||
    checksum !== digest(snapshot.tables)
  )
    throw Error("Sandaran Oracle tidak sah atau sumber dan destinasi sepadan.");
  await pool.transaction(async (connection) => {
    await prepareSession(connection);
    const plan = await snapshotTables(connection);
    if (plan.length !== snapshot.tables.length)
      throw Error("Inventori sandaran Oracle tidak sepadan.");
    for (const table of plan) {
      await connection.execute(
        `LOCK TABLE ${table.name} IN EXCLUSIVE MODE NOWAIT`,
      );
      const existing = await queryRows(
        connection,
        `SELECT 1 FROM ${table.name} WHERE ROWNUM=1`,
        {},
      );
      if (existing.length)
        throw Error("Semua jadual destinasi Oracle mesti kosong.");
    }
    // The proof and representative form a cycle. Validate it before commit.
    const representatives = plan.find(
      ({ name }) => name === "STL_COMPANY_REPRESENTATIVES",
    );
    const boundProof = representatives?.columns.some(
      ({ COLUMN_NAME }) => COLUMN_NAME === "VERIFIED_DOCUMENT_ID",
    );
    if (boundProof)
      await connection.execute("SET CONSTRAINT STL_FK_DEL_PROOF DEFERRED");
    for (const [index, table] of plan.entries())
      await restoreTable(connection, table, snapshot.tables[index]);
    if (boundProof)
      await connection.execute("SET CONSTRAINT STL_FK_DEL_PROOF IMMEDIATE");
    const restored: TableData[] = [];
    for (const table of plan) restored.push(await readTable(connection, table));
    if (checksum !== digest(restored)) {
      const mismatches = restored.filter(
        (item, index) =>
          JSON.stringify(item) !== JSON.stringify(snapshot.tables[index]),
      );
      throw Error(
        `Cap jari data pemulihan Oracle tidak sepadan: ${mismatches.map(({ name }) => name).join(", ")}.`,
      );
    }
  });
  return checksum;
}
