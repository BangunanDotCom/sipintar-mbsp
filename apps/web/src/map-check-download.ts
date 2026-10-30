import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { createBasemapController } from "./basemap-controller";
import { mountBasemap } from "./map-basemap";
import { readMapConfig } from "./map-config";
const config = readMapConfig({});
const result = document.querySelector<HTMLElement>("#map-result")!,
  retry = document.querySelector<HTMLButtonElement>("#retry")!;
const latitude = document.querySelector<HTMLInputElement>("#latitude")!,
  longitude = document.querySelector<HTMLInputElement>("#longitude")!;
const source = document.querySelector<HTMLElement>("#map-source")!;
source.textContent = "OpenFreeMap — ujian kendiri (tanpa localhost)";
// OSM raster expects an HTTP Referer. A local file uses the independent
// OpenFreeMap source directly, rather than attempting to forge that header.
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
  (_provider, events) => mountBasemap(m, config, "openfreemap", events),
  (state) => {
    result.dataset.status = state.phase;
    result.dataset.provider = "openfreemap";
    result.textContent =
      state.phase === "ready"
        ? "READY — Peta asas telah dirender. Semak jalan dan nama lokasi secara visual."
        : state.phase === "loading"
          ? "Memuatkan peta sebenar melalui internet…"
          : "UNAVAILABLE — Peta belum dapat dimuatkan. Semak akses internet/penyedia atau sokongan WebGL. Ini bukan pengesahan peta berjaya.";
    retry.disabled = state.phase !== "unavailable";
  },
  false,
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
