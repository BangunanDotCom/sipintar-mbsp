import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
const artifact = new URL("../../docs/previews/map-check.html", import.meta.url);
let server: Server, origin: string;
test.beforeAll(async () => {
  const moduleUrl = new URL(
    "../../scripts/serve-map-check.mjs",
    import.meta.url,
  );
  const { createMapCheckServer } = (await import(moduleUrl.href)) as {
    createMapCheckServer: () => Server;
  };
  server = createMapCheckServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  origin = `http://localhost:${(server.address() as AddressInfo).port}`;
});
test.afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
});
const syntheticStyle = {
  version: 8,
  sources: {
    synthetic: {
      type: "geojson",
      data: {
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            properties: { name: "DATA UJIAN - bukan jalan sebenar" },
            geometry: {
              type: "LineString",
              coordinates: [
                [100.38, 5.36],
                [100.46, 5.4],
              ],
            },
          },
        ],
      },
    },
  },
  layers: [
    {
      id: "background",
      type: "background",
      paint: { "background-color": "#e8f3f7" },
    },
    {
      id: "synthetic-road",
      type: "line",
      source: "synthetic",
      paint: { "line-color": "#2263aa", "line-width": 8 },
    },
  ],
};

const pixel = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQAAAABJRU5ErkJggg==",
  "base64",
);
async function vectorFixture(page: import("@playwright/test").Page) {
  await page.route("https://tile.openstreetmap.org/**", (route) =>
    route.abort(),
  );
  await page.route("https://tiles.openfreemap.org/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*" },
      body: JSON.stringify(syntheticStyle),
    }),
  );
}
test("HTTP download uses OSM first without requiring a WebGL worker", async ({
  page,
}) => {
  const workers: string[] = [],
    alternatives: string[] = [],
    errors: string[] = [];
  page.on("worker", (worker) => workers.push(worker.url()));
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("https://tile.openstreetmap.org/**", (route) => {
    expect(route.request().headers().referer).toBe(origin + "/");
    return route.fulfill({
      status: 200,
      contentType: "image/png",
      body: pixel,
    });
  });
  await page.route("https://tiles.openfreemap.org/**", (route) => {
    alternatives.push(route.request().url());
    return route.abort();
  });
  await page.goto(origin + "/map-check.html");
  await expect(page.locator("#map-result")).toHaveAttribute(
    "data-status",
    "ready",
  );
  await expect(page.locator("#map-result")).toHaveAttribute(
    "data-provider",
    "primary",
  );
  await expect(page.locator("#worker-result")).toHaveAttribute(
    "data-status",
    "ready",
  );
  expect(workers).toEqual([]);
  expect(alternatives).toEqual([]);
  expect(errors).toEqual([]);
});
test("HTTP fallback uses same-origin worker with HTTP 200 JavaScript and no redirect", async ({
  page,
  request,
}) => {
  const errors: string[] = [],
    workers: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("worker", (worker) => workers.push(worker.url()));
  await vectorFixture(page);
  await page.goto(origin + "/map-check.html");
  await expect(page.locator("#map-result")).toHaveAttribute(
    "data-status",
    "ready",
    { timeout: 20000 },
  );
  await expect(page.locator("#map-result")).toHaveAttribute(
    "data-provider",
    "openfreemap",
  );
  const workerUrl = await page.locator("#worker-url").textContent();
  expect(new URL(workerUrl!).origin).toBe(origin);
  const response = await request.get(workerUrl!, { maxRedirects: 0 });
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("javascript");
  expect(response.headers().location).toBeUndefined();
  await expect(page.locator("#worker-result")).toHaveAttribute(
    "data-status",
    "ready",
  );
  expect(workers.length).toBeGreaterThan(0);
  expect(
    workers.every(
      (url) => new URL(url).origin === origin && url.startsWith("http:"),
    ),
  ).toBe(true);
  await expect(page.locator(".maplibregl-canvas")).toBeVisible();
  await page.locator("#map").click({ position: { x: 200, y: 150 } });
  const before = await page.locator("#latitude").inputValue();
  expect(before).not.toBe("");
  await page
    .locator(".leaflet-marker-icon")
    .dragTo(page.locator("#map"), { targetPosition: { x: 300, y: 220 } });
  await expect(page.locator("#latitude")).not.toHaveValue(before);
  await page.locator(".leaflet-control-zoom-in").click();
  await expect(page.locator("#map-result")).toHaveAttribute(
    "data-status",
    "ready",
  );
  expect(errors).toEqual([]);
});
test("forced vector test diagnoses a worker cross-origin redirect without claiming READY", async ({
  page,
}) => {
  await vectorFixture(page);
  await page.route("**/assets/maplibre-gl-worker-*.js", (route) =>
    route.fulfill({
      status: 302,
      headers: { location: "http://127.0.0.1:5173/worker-test.js" },
      body: "",
    }),
  );
  await page.goto(origin + "/map-check.html?provider=openfreemap");
  await expect(page.locator("#worker-result")).toHaveAttribute(
    "data-status",
    "unavailable",
  );
  await expect(page.locator("#map-result")).toHaveAttribute(
    "data-status",
    "unavailable",
    { timeout: 20000 },
  );
});
test("HTTP failure remains unavailable and coordinates remain usable on mobile", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("https://tile.openstreetmap.org/**", (route) =>
    route.abort(),
  );
  await page.route("https://tiles.openfreemap.org/**", (route) =>
    route.abort(),
  );
  await page.goto(origin + "/map-check.html");
  await expect(page.locator("#map-result")).toHaveAttribute(
    "data-status",
    "unavailable",
    { timeout: 20000 },
  );
  await page
    .getByRole("button", { name: "Letak Pin di Tengah Peta", exact: true })
    .click();
  await expect(page.locator("#latitude")).toHaveValue("5.380000");
  await expect(page.locator("#longitude")).toHaveValue("100.420000");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("non-HTTP document refuses to initialize a map or a Blob worker", async ({
  page,
}) => {
  const requests: string[] = [],
    workers: string[] = [];
  page.on("request", (request) => requests.push(request.url()));
  page.on("worker", (worker) => workers.push(worker.url()));
  // Enterprise Chromium disallows file:// navigation. Exercise the protocol guard
  // on another non-HTTP opaque document without bypassing the browser policy.
  await page.setContent(await readFile(artifact, "utf8"));
  await expect(page.locator("#map-result")).toHaveAttribute(
    "data-status",
    "http-required",
  );
  await expect(page.locator(".leaflet-container")).toHaveCount(0);
  expect(requests).toEqual([]);
  expect(workers).toEqual([]);
});
