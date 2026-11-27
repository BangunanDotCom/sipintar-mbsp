import { randomBytes, randomUUID } from "node:crypto";
import { openPremisesDraft, registerApplicant } from "./applicant-fixtures";
import { awaitDraftRequestBudget } from "./request-budget";
import { expect } from "@playwright/test";
import { test } from "./parity-browser-test";
// Network fixtures prove rendering/fallback mechanics only. They are never saved as review screenshots.
const pixel = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQAAAABJRU5ErkJggg==",
  "base64",
);
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
test("map primary: complete tile batch ready, HTTPS/referer and no fallback loaded", async ({
  page,
}) => {
  const errors: string[] = [],
    alternatives: string[] = [],
    zooms: number[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("https://tile.openstreetmap.org/**", async (route) => {
    zooms.push(Number(new URL(route.request().url()).pathname.split("/")[1]));
    expect(route.request().headers().referer).toMatch(
      /^http:\/\/localhost:5173\//,
    );
    await route.fulfill({ status: 200, contentType: "image/png", body: pixel });
  });
  await page.route("https://tiles.openfreemap.org/**", (route) => {
    alternatives.push(route.request().url());
    return route.abort();
  });
  await page.goto("/map-check.html");
  await expect(page.locator("#map-result")).toHaveAttribute(
    "data-status",
    "ready",
  );
  await expect(page.locator("#map-result")).toHaveAttribute(
    "data-provider",
    "primary",
  );
  await page.locator(".leaflet-control-zoom-in").click();
  await expect.poll(() => zooms.includes(15)).toBe(true);
  await expect(page.locator("#map-result")).toHaveAttribute(
    "data-status",
    "ready",
  );
  expect(alternatives).toEqual([]);
  expect(errors).toEqual([]);
});
test("map fallback: failed primary switches once to a real WebGL renderer using synthetic test geography", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("https://tile.openstreetmap.org/**", (route) =>
    route.fulfill({ status: 403, body: "Controlled test failure" }),
  );
  await page.route("https://tiles.openfreemap.org/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(syntheticStyle),
    }),
  );
  await page.goto("/map-check.html");
  await expect(page.locator("#map-result")).toHaveAttribute(
    "data-status",
    "ready",
    { timeout: 20000 },
  );
  await expect(page.locator("#map-result")).toHaveAttribute(
    "data-provider",
    "openfreemap",
  );
  await expect(page.locator(".maplibregl-canvas")).toBeVisible();
  await expect(page.locator(".leaflet-control-attribution")).toContainText(
    "OpenMapTiles",
  );
  expect(errors).toEqual([]);
});
test("map failure: both providers fail truthfully, no loop and explicit retry can recover", async ({
  page,
}) => {
  const errors: string[] = [];
  let requests = 0,
    alternative = 0,
    working = false;
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("https://tile.openstreetmap.org/**", (route) => {
    requests++;
    return working
      ? route.fulfill({ status: 200, contentType: "image/png", body: pixel })
      : route.fulfill({ status: 403, body: "Controlled test failure" });
  });
  await page.route("https://tiles.openfreemap.org/**", (route) => {
    alternative++;
    return route.fulfill({ status: 403, body: "Controlled test failure" });
  });
  await page.goto("/map-check.html");
  await expect(page.locator("#map-result")).toHaveAttribute(
    "data-status",
    "unavailable",
    { timeout: 20000 },
  );
  expect(alternative).toBe(1);
  const failedRequests = requests;
  await page
    .getByRole("button", { name: "Cuba Semula", exact: true })
    .isEnabled();
  expect(requests).toBe(failedRequests);
  working = true;
  await page.getByRole("button", { name: "Cuba Semula", exact: true }).click();
  await expect(page.locator("#map-result")).toHaveAttribute(
    "data-status",
    "ready",
  );
  await expect(page.locator("#map-result")).toHaveAttribute(
    "data-provider",
    "primary",
  );
  expect(alternative).toBe(1);
  expect(errors).toEqual([]);
});

test("portal fallback preserves click, drag, zoom, coordinates and real draft save", async ({
  page,
}) => {
  test.setTimeout(120000);
  await awaitDraftRequestBudget(page.request);
  await registerApplicant(
    page,
    `map-${randomUUID()}@example.test`,
    "DATA UJIAN Peta",
    `Aa1!${randomBytes(24).toString("hex")}`,
  );
  await page.route("https://tile.openstreetmap.org/**", (route) =>
    route.fulfill({ status: 403, body: "Controlled test failure" }),
  );
  await page.route("https://tiles.openfreemap.org/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(syntheticStyle),
    }),
  );
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const { id } = await openPremisesDraft(page);
  await expect(page.locator(".map-status")).toHaveAttribute(
    "data-basemap-status",
    "ready",
    { timeout: 20000 },
  );
  await expect(page.locator(".map-status")).toHaveAttribute(
    "data-basemap-provider",
    "openfreemap",
  );
  await page.locator(".premises-map").click({ position: { x: 200, y: 150 } });
  const before = await page
    .getByLabel("Latitude", { exact: true })
    .inputValue();
  await page
    .locator(".leaflet-marker-icon")
    .dragTo(page.locator(".premises-map"), {
      targetPosition: { x: 300, y: 220 },
    });
  await expect(page.getByLabel("Latitude", { exact: true })).not.toHaveValue(
    before,
  );
  await page.locator(".leaflet-control-zoom-in").click();
  await expect(page.locator(".map-center")).toContainText("Zoom 14");
  const latitude = await page
      .getByLabel("Latitude", { exact: true })
      .inputValue(),
    longitude = await page
      .getByLabel("Longitude", { exact: true })
      .inputValue();
  await page.getByRole("button", { name: "Simpan Draf", exact: true }).click();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "Maklumat premis berjaya disimpan" }),
  ).toBeVisible();
  const saved = await page.request.get(`/api/application-drafts/${id}/premises`);
  expect(saved.ok()).toBeTruthy();
  const { premises: stored } = await saved.json();
  expect(stored.latitude).toBe(Number(latitude));
  expect(stored.longitude).toBe(Number(longitude));
  await page.reload();
  await expect(page.getByLabel("Latitude", { exact: true })).toHaveValue(
    latitude,
  );
  await expect(page.getByLabel("Longitude", { exact: true })).toHaveValue(
    longitude,
  );
  await expect(page.locator(".map-status")).toHaveAttribute(
    "data-basemap-status",
    "ready",
    { timeout: 20000 },
  );
});

test("unsupported WebGL fails gracefully and retry/zoom still work", async ({
  page,
}) => {
  const errors: string[] = [],
    zooms: number[] = [];
  let working = false;
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
      value: function (type: string, ...args: any[]) {
        if (type === "webgl2") return null;
        return Reflect.apply(original, this, [type, ...args]);
      },
    });
  });
  await page.route("https://tile.openstreetmap.org/**", (route) => {
    zooms.push(Number(new URL(route.request().url()).pathname.split("/")[1]));
    return working
      ? route.fulfill({ status: 200, contentType: "image/png", body: pixel })
      : route.fulfill({ status: 403, body: "Controlled test failure" });
  });
  await page.route("https://tiles.openfreemap.org/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(syntheticStyle),
    }),
  );
  await page.goto("/map-check.html");
  await expect(page.locator("#map-result")).toHaveAttribute(
    "data-status",
    "unavailable",
    { timeout: 20000 },
  );
  working = true;
  await page.getByRole("button", { name: "Cuba Semula", exact: true }).click();
  await expect(page.locator("#map-result")).toHaveAttribute(
    "data-status",
    "ready",
  );
  await page.locator(".leaflet-control-zoom-in").click();
  await expect.poll(() => zooms.includes(15)).toBe(true);
  expect(errors).toEqual([]);
});
