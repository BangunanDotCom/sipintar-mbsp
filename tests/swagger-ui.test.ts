import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../apps/api/src/app";

describe("Swagger UI", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    await app?.close();
  });

  it("serves the docs page with and without a trailing slash", async () => {
    for (const url of ["/api/docs", "/api/docs/"]) {
      const response = await app.inject(url);

      expect(response.statusCode).toBe(200);
      expect(response.headers["content-type"]).toMatch(/^text\/html\b/);
      expect(response.body).toContain("swagger-initializer.js");
    }
  });

  it("publishes the OpenAPI document and its existing session requirements", async () => {
    const json = await app.inject("/api/docs/json");
    expect(json.statusCode).toBe(200);
    expect(json.json()).toMatchObject({
      openapi: expect.stringMatching(/^3\./),
      info: { title: "STAYLink MBSP API" },
      paths: {
        "/api/health": { get: { security: [] } },
        "/api/dashboard": { get: { security: [{ sessionCookie: [] }] } },
      },
    });

    const yaml = await app.inject("/api/docs/yaml");
    expect(yaml.statusCode).toBe(200);
    expect(yaml.headers["content-type"]).toMatch(/^application\/x-yaml\b/);
    expect(yaml.body).toContain("title: STAYLink MBSP API");
  });

  it("serves the browser assets within the docs static route", async () => {
    for (const [filename, contentType] of [
      ["swagger-ui-bundle.js", /^application\/javascript\b/],
      ["swagger-initializer.js", /^application\/javascript\b/],
      ["swagger-ui.css", /^text\/css\b/],
    ] as const) {
      const response = await app.inject(`/api/docs/static/${filename}`);

      expect(response.statusCode).toBe(200);
      expect(response.headers["content-type"]).toMatch(contentType);
      expect(response.body.length).toBeGreaterThan(0);
    }
  });

  it("keeps missing assets, off-prefix requests and protected API routes separate", async () => {
    for (const url of [
      "/api/docs/static/missing.js",
      "/api/static/swagger-ui-bundle.js",
    ]) {
      expect((await app.inject(url)).statusCode).toBe(404);
    }

    expect((await app.inject("/api/dashboard")).statusCode).toBe(401);
  });
});
