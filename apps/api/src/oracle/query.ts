import oracledb, { type BindParameters, type Connection } from "oracledb";
import type { OraclePool } from "./pool.js";

export function oracleTable(pool: OraclePool, name: `STL_${string}`) {
  if (!/^STL_LAB_[A-Z][A-Z0-9_]{0,19}$/.test(pool.owner))
    throw Error("Schema Oracle tidak sah.");
  if (!/^STL_[A-Z0-9_]{1,26}$/.test(name))
    throw Error("Nama jadual Oracle tidak sah.");
  return `${pool.owner}.${name}`;
}

export async function queryRows<T>(
  connection: Connection,
  sql: string,
  binds: BindParameters,
) {
  const result = await connection.execute<T>(sql, binds, {
    outFormat: oracledb.OUT_FORMAT_OBJECT,
    fetchTypeHandler: ({ dbType }) => {
      if (dbType === oracledb.DB_TYPE_CLOB) return { type: oracledb.STRING };
    },
  });
  return result.rows ?? [];
}

export async function affected(
  connection: Connection,
  sql: string,
  binds: BindParameters,
) {
  return (await connection.execute(sql, binds)).rowsAffected ?? 0;
}

export function requireRecord<T>(value: T | null | undefined): T {
  if (value === null || value === undefined)
    throw Object.assign(Error("Rekod tidak ditemui."), { code: "P2025" });
  return value;
}

export const clob = (val: string) => ({ val, type: oracledb.CLOB });
export const timestamp = (val: Date | null) => ({
  val,
  type: oracledb.DB_TYPE_TIMESTAMP_TZ,
});

export function oracleInList(
  column: string,
  ids: readonly string[],
  operation: "IN" | "NOT IN",
  prefix = "id_",
) {
  if (ids.length === 0)
    return { sql: operation === "IN" ? "1=0" : "1=1", binds: {} };
  const names = ids.map((_, index) => `${prefix}${index}`);
  return {
    sql: `${column} ${operation} (${names.map((name) => `:${name}`).join(",")})`,
    binds: Object.fromEntries(names.map((name, index) => [name, ids[index]])),
  };
}
