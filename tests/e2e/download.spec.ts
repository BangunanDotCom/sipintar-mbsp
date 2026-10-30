import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
const artifact = new URL("../../docs/previews/map-check.html", import.meta.url);
// Managed Chromium blocks file://. Exercise the exact inline document on an
// opaque about:blank origin; this does not verify opening a local file in Chrome.
const html = await readFile(artifact, "utf8");
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
test("inline download renders a controlled fixture over HTTP without external scripts", async ({
  page,
}) => {
  const errors: string[] = [],
    disallowed: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => {
    const u = new URL(r.url());
    if (
      ["http:", "https:"].includes(u.protocol) &&
      u.hostname !== "tiles.openfreemap.org" &&
      u.hostname !== "localhost"
    )
      disallowed.push(r.url());
  });
  await page.route("https://tiles.openfreemap.org/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*" },
      body: JSON.stringify(syntheticStyle),
    }),
  );
  await page.route("http://localhost:5173/download-check", (route) =>
    route.fulfill({ contentType: "text/html", body: html }),
  );
  await page.goto("/download-check");
  await expect(page.locator("#map-result")).toHaveAttribute(
    "data-status",
    "ready",
    { timeout: 20000 },
  );
  await expect(page.locator("#map-source")).toContainText("tanpa localhost");
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
  expect(disallowed).toEqual([]);
  expect(errors).toEqual([]);
});
test("inline download reports provider failure and keeps coordinate selection without localhost", async ({
  page,
}) => {
  const errors: string[] = [],
    localRequests: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => {
    if (/^https?:\/\/(localhost|127\.0\.0\.1)/.test(r.url()))
      localRequests.push(r.url());
  });
  await page.route("https://tiles.openfreemap.org/**", (route) =>
    route.abort(),
  );
  await page.setContent(html);
  await expect(page.locator("#map-result")).toHaveAttribute(
    "data-status",
    "unavailable",
    { timeout: 20000 },
  );
  await expect(
    page.getByRole("button", { name: "Cuba Semula", exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "Letak Pin di Tengah Peta", exact: true })
    .click();
  await expect(page.locator("#latitude")).toHaveValue("5.380000");
  await expect(page.locator("#longitude")).toHaveValue("100.420000");
  expect(localRequests).toEqual([]);
  expect(errors).toEqual([]);
});
