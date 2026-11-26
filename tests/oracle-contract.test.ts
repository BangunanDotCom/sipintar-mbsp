import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { oracleConfig } from "../apps/api/src/oracle/config";
import {
  oracleBoolean,
  fromOracleBoolean,
  oracleDateOnly,
  oracleInstant,
  oracleOptionalText,
} from "../apps/api/src/oracle/codecs";

const env = {
  ORACLE_ENV: "isolated-synthetic",
  ORACLE_HOST: "127.0.0.1",
  ORACLE_SERVICE: "STLTEST_PDB",
  ORACLE_EXPECTED_DB_NAME: "STLTEST_PDB",
  ORACLE_PORT: "15219",
  ORACLE_SCHEMA: "STL_LAB_OWNER",
  ORACLE_USER: "STL_LAB_RUNTIME",
  ORACLE_PASSWORD: "fixture",
};

describe("Oracle isolated lab boundary", () => {
  it("admits explicit, separate loopback identities", () => {
    expect(oracleConfig(env, "runtime")).toMatchObject({
      owner: env.ORACLE_SCHEMA,
      port: 15219,
    });
    expect(
      oracleConfig({ ...env, ORACLE_USER: env.ORACLE_SCHEMA }, "install")
        .purpose,
    ).toBe("install");
  });
  it.each([
    { ORACLE_ENV: "production" },
    { ORACLE_HOST: "db.invalid" },
    { ORACLE_PORT: "15219/OTHER" },
    { ORACLE_SERVICE: "EXTERNAL_APP" },
    { ORACLE_SCHEMA: "SHARED_OWNER" },
    { ORACLE_USER: "STL_LAB_OWNER" },
    { ORACLE_USER: 'STL_LAB_R"_ABC' },
    { ORACLE_PASSWORD: "" },
  ])("refuses invalid or ambiguous inputs %o", (change) => {
    expect(() => oracleConfig({ ...env, ...change }, "runtime")).toThrow();
  });
});

it("preserves date-only, UTC, Boolean and optional text contracts", () => {
  expect(oracleOptionalText("")).toBeNull();
  expect(oracleOptionalText(" ")).toBe(" ");
  expect(fromOracleBoolean(oracleBoolean(false))).toBe(false);
  expect(() => fromOracleBoolean(2)).toThrow();
  expect(oracleInstant(new Date("2026-11-24T03:00:00.123Z"))).toBe(
    "2026-11-24T03:00:00.123 +00:00",
  );
  expect(oracleDateOnly("2024-02-29")).toBe("2024-02-29");
  expect(() => oracleDateOnly("2025-02-29")).toThrow();
});

it("inventories all Prisma tables and all user-defined DDL names as STL", async () => {
  const inventories = await Promise.all(
    ["001", "002", "003", "004"].map(
      async (number) =>
        JSON.parse(
          await readFile(`database/oracle/${number}-inventory.json`, "utf8"),
        ) as { type: string; name: string }[],
    ),
  );
  const inventory = inventories.flat();
  const prisma = await readFile("prisma/schema.prisma", "utf8");
  const tables = [...prisma.matchAll(/@@map\("([^"]+)"\)/g)].map(
    ([, name]) =>
      "STL_" +
      (name === "company_representation_invitations"
        ? "company_rep_invitations"
        : name === "synthetic_financial_entries"
          ? "synth_financial_entries"
          : name
      ).toUpperCase(),
  );
  expect(
    inventory
      .filter(({ type }) => type === "TABLE")
      .map(({ name }) => name)
      .sort(),
  ).toEqual(tables.sort());
  expect(
    inventory.every(({ name }) => /^STL_[A-Z0-9_]{1,26}$/.test(name)),
  ).toBe(true);
  expect(
    new Set(inventory.map(({ type, name }) => type + ":" + name)).size,
  ).toBe(inventory.length);
  const ddl = await readFile("database/oracle/001-baseline.sql", "utf8");
  expect(ddl).not.toMatch(
    /\b(?:DROP|TRUNCATE|DELETE FROM|CREATE OR REPLACE|CREATE SEQUENCE)\b/i,
  );
});
