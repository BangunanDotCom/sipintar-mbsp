import type { Prisma } from "@prisma/client";
import { oracleJson } from "./codecs.js";

export const encodeOracleConfig = (value: Prisma.JsonValue) =>
  oracleJson({ version: 1, value });

export function decodeOracleConfig(json: string): Prisma.JsonValue {
  const entry = JSON.parse(json) as {
    version?: unknown;
    value?: Prisma.JsonValue;
  } | null;
  if (
    entry === null ||
    entry.version !== 1 ||
    !Object.hasOwn(entry, "value") ||
    entry.value === undefined
  )
    throw Error("Format konfigurasi Oracle belum disokong.");
  return entry.value;
}
