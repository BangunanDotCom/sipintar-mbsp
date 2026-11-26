import { Prisma } from "@prisma/client";
import pg from "pg";
import type { OraclePool } from "../../apps/api/src/oracle/pool.js";
import {
  assembleOracleSnapshot,
  restoreOracleSnapshot,
  snapshotTables,
  type TableData,
} from "./snapshot.js";

const oracleName = (value: string) =>
  value.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toUpperCase();

function pgIdentifier(value: string) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value))
    throw Error("Pengecam sumber PostgreSQL tidak sah.");
  return `"${value}"`;
}

function sourceConfig(source: string | undefined) {
  const url = new URL(source ?? "");
  const name = url.pathname.slice(1);
  if (
    !["postgresql:", "postgres:"].includes(url.protocol) ||
    url.hostname !== "127.0.0.1" ||
    !/^staylink_[a-z0-9_]{1,35}_test$/.test(name) ||
    !url.username ||
    url.search ||
    url.hash
  )
    throw Error(
      "Import memerlukan sumber PostgreSQL loopback staylink_*_test.",
    );
  return { url, name };
}

function pgColumn(
  name: string,
  sourceType: string,
  targetType: string,
  configuration: boolean,
) {
  const column = `T.${pgIdentifier(name)}`;
  switch (targetType) {
    case "TIMESTAMP(6) WITH TIME ZONE":
      return `to_char(${column}, 'YYYY-MM-DD"T"HH24:MI:SS.US')`;
    case "DATE":
      return `to_char(${column}, 'YYYY-MM-DD"T"HH24:MI:SS')`;
    case "VARCHAR2":
      return `NULLIF(${column}::text, '')`;
    case "BLOB":
      return `replace(encode(${column}, 'base64'), chr(10), '')`;
    case "NUMBER":
      if (sourceType === "Boolean") return `(${column}::integer)::text`;
      return sourceType === "Decimal"
        ? `trim_scale(${column})::text`
        : `${column}::text`;
    case "BINARY_DOUBLE":
      return column;
    case "CLOB":
      return configuration
        ? `json_build_object('version', 1, 'value', ${column})::text`
        : `${column}::text`;
    default:
      throw Error("Pemetaan kolum sumber PostgreSQL belum disokong.");
  }
}

async function readPostgres(
  client: pg.Client,
  tables: Awaited<ReturnType<typeof snapshotTables>>,
) {
  const models = new Map(
    Prisma.dmmf.datamodel.models.map((model) => [
      "STL_" +
        (model.name === "CompanyRepresentationInvitation"
          ? "COMPANY_REP_INVITATIONS"
          : model.name === "SyntheticFinancialEntry"
            ? "SYNTH_FINANCIAL_ENTRIES"
            : oracleName(model.dbName ?? model.name)),
      model,
    ]),
  );
  const data: TableData[] = [];
  for (const { name, columns, primaryKey } of tables) {
    const model = models.get(name);
    if (!model?.dbName) throw Error("Jadual Oracle tiada pemetaan PostgreSQL.");
    const fields = new Map(
      model.fields
        .filter(({ kind }) => kind !== "object")
        .map((field) => [oracleName(field.dbName ?? field.name), field]),
    );
    const expressions = columns.map(({ COLUMN_NAME, DATA_TYPE }) => {
      const field = fields.get(COLUMN_NAME);
      if (!field)
        throw Error(`Pemetaan kolum tiada untuk ${name}.${COLUMN_NAME}.`);
      const configurationValue =
        COLUMN_NAME === "VALUE" &&
        (name === "STL_SYSTEM_CONFIGURATIONS" ||
          name === "STL_CONFIGURATION_VERSIONS");
      return pgColumn(
        field.dbName ?? field.name,
        field.type,
        DATA_TYPE,
        configurationValue,
      );
    });
    if (fields.size !== columns.length)
      throw Error(`Bilangan kolum PostgreSQL tidak sepadan untuk ${name}.`);
    const table = `"public".${pgIdentifier(model.dbName)}`;
    let select: string;
    if (name === "STL_SYNTHETIC_SUBMISSIONS") {
      select = `WITH RECURSIVE chain AS (
        SELECT S.*, ARRAY[S.id COLLATE "C"] AS path FROM ${table} S WHERE S."previousId" IS NULL
        UNION ALL SELECT S.*, C.path || S.id FROM ${table} S JOIN chain C
          ON S."previousId"=C.id AND S."draftId"=C."draftId"
          WHERE NOT(S.id=ANY(C.path))
      ) SELECT ${expressions.join(",")} FROM chain T ORDER BY T.path COLLATE "C"`;
    } else {
      const order = primaryKey.map((key) => {
        const field = fields.get(key)!;
        return `T.${pgIdentifier(field.dbName ?? field.name)}${field.type === "String" ? ' COLLATE "C"' : ""}`;
      });
      select = `SELECT ${expressions.join(",")} FROM ${table} T ORDER BY ${order.join(",")}`;
    }
    const { rows } = await client.query<(string | number | null)[]>({
      text: select,
      rowMode: "array",
    });
    if (name === "STL_SYNTHETIC_SUBMISSIONS") {
      const count = await client.query<{ count: string }>(
        `SELECT count(*) FROM ${table}`,
      );
      if (rows.length !== Number(count.rows[0].count))
        throw Error("Rantaian pembetulan PostgreSQL tidak lengkap.");
    }
    data.push({
      name,
      columns: columns.map(({ COLUMN_NAME }) => COLUMN_NAME),
      rows: rows.map((row) =>
        row.map((value) => (typeof value === "number" ? String(value) : value)),
      ),
    });
  }
  return data;
}

export async function importPostgresLab(
  pool: OraclePool,
  source: string | undefined,
) {
  const { url, name } = sourceConfig(source);
  const tables = await pool.use(snapshotTables);
  const client = new pg.Client({
    connectionString: url.href,
    connectionTimeoutMillis: 5000,
    statement_timeout: 20_000,
  });
  await client.connect();
  let data: TableData[];
  try {
    await client.query(
      "BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY",
    );
    await client.query("SET LOCAL TIME ZONE 'UTC'");
    const result = await client.query<{ name: string }>(
      "SELECT current_database() AS name",
    );
    if (result.rows[0]?.name !== name)
      throw Error("Identiti sumber PostgreSQL tidak sepadan.");
    data = await readPostgres(client, tables);
    await client.query("COMMIT");
  } finally {
    await client.end();
  }
  return restoreOracleSnapshot(
    pool,
    assembleOracleSnapshot(`POSTGRESQL:${name}`, data),
  );
}
