import { describe, it, expect } from "vitest";
import { resolveMapWorkerUrl } from "../apps/web/src/map-worker-url";

describe("map worker origin boundary", () => {
  it("resolves HTTP and HTTPS workers on the page origin, including a hosted subfolder", () => {
    expect(
      resolveMapWorkerUrl(
        "http://localhost:5174/map-check.html",
        "./assets/worker.js",
      ),
    ).toBe("http://localhost:5174/assets/worker.js");
    expect(
      resolveMapWorkerUrl(
        "https://portal.example.test/diagnostic/map-check.html",
        "./assets/worker.js",
      ),
    ).toBe("https://portal.example.test/diagnostic/assets/worker.js");
  });
  it("rejects unsupported document origins before creating a worker", () => {
    for (const page of [
      "file:///C:/map-check.html",
      "about:blank",
      "data:text/html,test",
    ])
      expect(() => resolveMapWorkerUrl(page, "/assets/worker.js")).toThrow(
        "HTTP/HTTPS",
      );
  });
  it("rejects CDN workers, credentials, opaque URLs, Blob URLs and origin changes", () => {
    for (const asset of [
      "https://cdn.example.test/worker.js",
      "http://portal.example.test/worker.js",
      "https://user:password@portal.example.test/worker.js",
      "blob:https://portal.example.test/id",
      "data:text/javascript,postMessage(1)",
      "file:///worker.js",
    ])
      expect(() =>
        resolveMapWorkerUrl(
          "https://portal.example.test/map-check.html",
          asset,
        ),
      ).toThrow("origin");
  });
});
