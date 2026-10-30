import { afterAll, beforeAll, describe, it, expect, vi } from "vitest";
import { buildApp } from "../apps/api/src/app";
import {
  assertDatabaseConfigured,
  safeServerFailure,
} from "../apps/api/src/errors";
import type { FastifyInstance } from "fastify";

describe("safe operational errors", () => {
  it("classifies connection, schema and configuration failures without exposing messages", () => {
    for (const [code, expected] of [
      ["ECONNREFUSED", "DATABASE_UNAVAILABLE"],
      ["P1001", "DATABASE_UNAVAILABLE"],
      ["P2022", "DATABASE_SCHEMA_NOT_READY"],
      ["42703", "DATABASE_SCHEMA_NOT_READY"],
      ["DATABASE_NOT_CONFIGURED", "SERVICE_NOT_CONFIGURED"],
    ]) {
      const result = safeServerFailure({
        code,
        message: "DO_NOT_LOG_INPUT",
        stack: "DO_NOT_LOG_INPUT",
        meta: { url: "DO_NOT_LOG_INPUT" },
      });
      expect(result.status).toBe(503);
      expect(result.code).toBe(expected);
      expect(JSON.stringify(result)).not.toContain("DO_NOT_LOG_INPUT");
    }
    expect(safeServerFailure({ errorCode: "P1001" }).code).toBe(
      "DATABASE_UNAVAILABLE",
    );
    const wrapped = safeServerFailure({
      code: "P2010",
      meta: {
        driverAdapterError: {
          cause: {
            kind: "DatabaseNotReachable",
            host: "DO_NOT_LOG_INPUT",
            originalMessage: "DO_NOT_LOG_INPUT",
          },
        },
      },
    });
    expect(wrapped).toMatchObject({
      status: 503,
      code: "DATABASE_UNAVAILABLE",
      diagnosticCode: "PG_UNREACHABLE",
    });
    expect(JSON.stringify(wrapped)).not.toContain("DO_NOT_LOG_INPUT");
  });
  it("retains bounded diagnostic codes and suppresses arbitrary error text", () => {
    expect(safeServerFailure({ code: "P2003" }).diagnosticCode).toBe("P2003");
    expect(
      safeServerFailure({
        code: "DO_NOT_LOG_INPUT",
        message: "DO_NOT_LOG_INPUT",
      }).diagnosticCode,
    ).toBe("UNCLASSIFIED");
  });
  it("rejects absent/malformed database settings without implicit pg defaults", () => {
    const previous = process.env.TEST_DATABASE_URL;
    try {
      for (const value of [
        "",
        "not-a-database-url",
        "https://example.test/db",
        "postgresql://localhost/",
      ]) {
        process.env.TEST_DATABASE_URL = value;
        expect(() => assertDatabaseConfigured()).toThrow("belum dikonfigurasi");
      }
    } finally {
      process.env.TEST_DATABASE_URL = previous;
    }
  });
});

describe("safe Fastify error reporting", () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp();
    app.post("/api/test-database-failure", async () => {
      throw Object.assign(new Error("DO_NOT_LOG_INPUT"), {
        code: "P2022",
        meta: { input: "DO_NOT_LOG_INPUT" },
      });
    });
  });
  afterAll(async () => {
    await app.close();
  });
  it("returns 503 with a server-generated reference and logs only safe fields", async () => {
    const log = vi.spyOn(app.log, "error");
    try {
      const response = await app.inject({
        method: "POST",
        url: "/api/test-database-failure",
        headers: { "request-id": "DO_NOT_LOG_INPUT" },
        payload: { name: "DO_NOT_LOG_INPUT", password: "DO_NOT_LOG_INPUT" },
      });
      expect(response.statusCode).toBe(503);
      expect(response.json()).toMatchObject({
        code: "DATABASE_SCHEMA_NOT_READY",
        requestId: expect.any(String),
      });
      expect(response.body).not.toContain("DO_NOT_LOG_INPUT");
      expect(log).toHaveBeenCalled();
      expect(JSON.stringify(log.mock.calls)).not.toContain("DO_NOT_LOG_INPUT");
      expect(log.mock.calls[0][0]).toMatchObject({
        diagnosticCode: "P2022",
        operation: "/api/test-database-failure",
      });
    } finally {
      log.mockRestore();
    }
  });
});
