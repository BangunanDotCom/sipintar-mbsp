import { randomUUID } from "node:crypto";
import oracledb from "oracledb";

export const newOracleId = randomUUID;

export function oracleOptionalText(value?: string | null) {
  return value === "" || value === undefined ? null : value;
}

export function oracleBoolean(value: boolean) {
  return value ? 1 : 0;
}

export function fromOracleBoolean(value: number) {
  if (value !== 0 && value !== 1)
    throw Error("Boolean Oracle di luar julat 0/1.");
  return value === 1;
}

export function oracleJson(value: unknown) {
  const encoded = JSON.stringify(value);
  if (encoded === undefined) throw Error("Nilai JSON Oracle tidak sah.");
  return { val: encoded, type: oracledb.CLOB };
}

export function oracleInstant(value: Date) {
  if (!Number.isFinite(value.getTime()))
    throw Error("Cap masa Oracle tidak sah.");
  return value.toISOString().slice(0, -1) + " +00:00";
}

export const oracleInstantSql = (bind: ":createdAt") =>
  `TO_TIMESTAMP_TZ(${bind}, 'YYYY-MM-DD"T"HH24:MI:SS.FF3 TZH:TZM')`;

export function oracleBinary(value: Uint8Array) {
  return { val: Buffer.from(value), type: oracledb.BLOB };
}

export function oracleDateOnly(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value))
    throw Error("Format tarikh Oracle tidak sah.");
  const date = new Date(value + "T00:00:00.000Z");
  if (
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  )
    throw Error("Tarikh Oracle tidak sah.");
  return value;
}
