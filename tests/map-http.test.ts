import { beforeAll, afterAll, describe, expect, it } from "vitest";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { readdir } from "node:fs/promises";

let server: Server, origin: string;
beforeAll(async () => {
  const moduleUrl = new URL("../scripts/serve-map-check.mjs", import.meta.url);
  const { createMapCheckServer } = (await import(moduleUrl.href)) as {
    createMapCheckServer: () => Server;
  };
  server = createMapCheckServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
});
describe("map-only static HTTP server", () => {
  it("serves HTML at root and map-check with a restrictive same-origin worker CSP", async () => {
    for (const path of ["/", "/map-check.html"]) {
      const response = await fetch(origin + path, { redirect: "manual" });
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("text/html");
      expect(response.headers.get("content-security-policy")).toContain(
        "worker-src 'self'",
      );
      expect(await response.text()).toContain("HTTP_REQUIRED");
    }
  });
  it("serves the emitted worker as JavaScript without redirects", async () => {
    const names = await readdir(
      new URL("../docs/previews/assets/", import.meta.url),
    );
    expect(names).toHaveLength(1);
    const response = await fetch(origin + "/assets/" + names[0], {
      redirect: "manual",
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("javascript");
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  });
  it("does not expose environment, backend, application files or directory listing", async () => {
    for (const path of [
      "/.env",
      "/api/health",
      "/apps/api/src/core.ts",
      "/assets/",
      "/assets/%2e%2e/.env",
      "/licenses/../.env",
      "/README.md",
    ]) {
      expect((await fetch(origin + path)).status).toBe(404);
    }
  });
  it("supports HEAD and rejects writes", async () => {
    const head = await fetch(origin + "/map-check.html", { method: "HEAD" });
    expect(head.status).toBe(200);
    expect(await head.text()).toBe("");
    const post = await fetch(origin + "/map-check.html", { method: "POST" });
    expect(post.status).toBe(405);
    expect(post.headers.get("allow")).toBe("GET, HEAD");
  });
});
