import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { createBasemapController } from "./basemap-controller";
import { mountBasemap } from "./map-basemap";
import { readMapConfig } from "./map-config";
import { resolveMapWorkerUrl } from "./map-worker-url";

function initialize() {
  const output = document.querySelector<HTMLElement>("#map-result")!;
  if (!["http:", "https:"].includes(location.protocol)) {
    output.dataset.status = "http-required";
    output.textContent =
      "HTTP_REQUIRED — Buka halaman melalui pelayan HTTP/HTTPS atau Codespaces. file:// tidak disokong; jangan gunakan fail ZIP lama.";
    return;
  }
  const vectorOnly =
    new URL(location.href).searchParams.get("provider") === "openfreemap";
  const config = readMapConfig({});
  const result = document.querySelector<HTMLElement>("#map-result")!,
    retry = document.querySelector<HTMLButtonElement>("#retry")!;
  const latitude = document.querySelector<HTMLInputElement>("#latitude")!,
    longitude = document.querySelector<HTMLInputElement>("#longitude")!;
  const source = document.querySelector<HTMLElement>("#map-source")!;
  source.textContent = vectorOnly
    ? "OpenFreeMap — ujian worker khusus"
    : "OpenStreetMap → OpenFreeMap jika sumber utama gagal";
  const worker = resolveMapWorkerUrl();
  document.querySelector<HTMLElement>("#worker-url")!.textContent = worker;
  const workerResult = document.querySelector<HTMLElement>("#worker-result")!;
  workerResult.dataset.status = "loading";
  workerResult.textContent =
    "Menyemak respons skrip worker (origin yang sama, tanpa redirect)…";
  void fetch(worker, { redirect: "error" })
    .then((response) => {
      if (
        !response.ok ||
        response.redirected ||
        new URL(response.url).origin !== location.origin ||
        !/(?:java|ecma)script/i.test(response.headers.get("content-type") || "")
      )
        throw new Error("Worker HTTP, origin atau MIME tidak sah");
      workerResult.dataset.status = "ready";
      workerResult.textContent = `Worker HTTP ${response.status}; JavaScript; origin sama; tiada redirect. Ini belum mengesahkan peta jalan.`;
    })
    .catch(() => {
      workerResult.dataset.status = "unavailable";
      workerResult.textContent =
        "Worker gagal: semak HTTP 200, MIME JavaScript, CSP worker-src 'self' dan pengalihan login/CDN dalam Network. OSM raster tidak memerlukan worker ini.";
    });
  const m = L.map("map", {
    minZoom: 3,
    maxZoom: 19,
    zoomAnimation: false,
    fadeAnimation: false,
    scrollWheelZoom: false,
  }).setView([5.38, 100.42], 14);
  let marker: L.Marker | undefined;
  const icon = L.divIcon({
    className: "test-pin",
    html: '<span aria-hidden="true"></span>',
    iconSize: [26, 34],
    iconAnchor: [13, 34],
  });
  function select(lat: number, lng: number) {
    const p = L.latLng(
      Math.max(-85, Math.min(85, lat)),
      ((((lng + 180) % 360) + 360) % 360) - 180,
    );
    latitude.value = p.lat.toFixed(6);
    longitude.value = p.lng.toFixed(6);
    if (!marker) {
      marker = L.marker(p, {
        icon,
        draggable: true,
        title: "Pin ujian",
        alt: "Pin ujian",
      }).addTo(m);
      marker.on("dragend", () => {
        const value = marker!.getLatLng();
        select(value.lat, value.lng);
      });
    } else marker.setLatLng(p);
  }
  m.on("click", (e: L.LeafletMouseEvent) => select(e.latlng.lat, e.latlng.lng));
  const controller = createBasemapController(
    (provider, events) =>
      mountBasemap(m, config, vectorOnly ? "openfreemap" : provider, events),
    (state) => {
      result.dataset.status = state.phase;
      result.dataset.provider = vectorOnly ? "openfreemap" : state.provider;
      result.textContent =
        state.phase === "ready"
          ? "READY — Peta asas telah dirender. Semak jalan dan nama lokasi secara visual."
          : state.phase === "loading"
            ? "Memuatkan peta sebenar melalui internet…"
            : "UNAVAILABLE — Peta belum dapat dimuatkan. Semak akses internet/penyedia atau sokongan WebGL. Ini bukan pengesahan peta berjaya.";
      retry.disabled = state.phase !== "unavailable";
    },
    !vectorOnly,
  );
  retry.addEventListener("click", () => controller.retry());
  document
    .querySelector<HTMLButtonElement>("#center-pin")!
    .addEventListener("click", () => {
      const p = m.getCenter();
      select(p.lat, p.lng);
    });
  window.addEventListener(
    "pagehide",
    () => {
      controller.dispose();
      m.remove();
    },
    { once: true },
  );
}
initialize();
