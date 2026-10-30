import { test, expect } from "@playwright/test";
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
  const { randomUUID, randomBytes } = await import("node:crypto"),
    { db, token, hash } = await import("../../apps/api/src/core"),
    { protectIdentification } = await import("../../apps/api/src/identity");
  const user = await db.user.create({
    data: {
      name: "DATA UJIAN Peta",
      email: `map-${randomUUID()}@example.test`,
      phone: "0000000000",
      kind: "APPLICANT",
      emailVerified: true,
      ...protectIdentification(`UJIAN${randomBytes(6).toString("hex")}`),
      roles: { create: { roleId: "PEMOHON", reference: "DATA UJIAN Peta" } },
    },
  });
  const profile = {
    userId: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    identificationMasked: user.identificationMasked,
  };
  const draft = await db.applicationDraft.create({
    data: {
      initiatedByUserId: user.id,
      officialApplicantUserId: user.id,
      capacity: "INDIVIDUAL",
      initiatorSnapshot: profile,
      applicantSnapshot: profile,
    },
  });
  const raw = token();
  await db.session.create({
    data: {
      id: hash(raw),
      userId: user.id,
      csrfHash: hash(token()),
      activeRole: "PEMOHON",
      mfaVerified: true,
      expiresAt: new Date(Date.now() + 3600000),
    },
  });
  await page.context().addCookies([
    {
      name: "staylink",
      value: raw,
      url: "http://localhost:5173",
      httpOnly: true,
      sameSite: "Strict",
    },
  ]);
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
  await page.goto(`/permohonan/draf/${draft.id}/premis`);
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
  const stored = await db.applicationPremises.findUniqueOrThrow({
    where: { draftId: draft.id },
  });
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
  await db.$disconnect();
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
