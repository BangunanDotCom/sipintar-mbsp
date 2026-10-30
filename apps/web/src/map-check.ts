import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { readMapConfig } from "./map-config";
import { createBasemapController } from "./basemap-controller";
import { mountBasemap } from "./map-basemap";
const style = document.createElement("style");
style.textContent =
  "body{font:16px/1.6 system-ui;color:#123252;background:#f3f7fb;margin:20px}main{max-width:1100px;margin:auto}#map{height:500px;background:#e6eef2;border:1px solid #a7becd}button{padding:12px;margin-top:16px}#map .maplibregl-canvas{pointer-events:none}";
document.head.append(style);
const m = L.map("map", {
    minZoom: 3,
    maxZoom: 19,
    scrollWheelZoom: false,
    zoomAnimation: false,
    fadeAnimation: false,
  }).setView([5.38, 100.42], 14),
  config = readMapConfig(import.meta.env),
  output = document.querySelector<HTMLElement>("#map-result")!,
  retry = document.querySelector<HTMLButtonElement>("#retry")!;
const controller = config.issue
  ? null
  : createBasemapController(
      (provider, events) => mountBasemap(m, config, provider, events),
      (state) => {
        output.dataset.status = state.phase;
        output.dataset.provider = state.provider;
        output.textContent = `${state.phase.toUpperCase()} — ${state.provider === "primary" ? config.primaryName : "OpenFreeMap"}${state.reason ? ` (${state.reason})` : ""}`;
        retry.disabled = state.phase !== "unavailable";
      },
      config.fallback !== "none",
    );
if (config.issue) {
  output.dataset.status = "unavailable";
  output.dataset.provider = "primary";
  output.textContent = config.issue;
}
retry.addEventListener("click", () => controller?.retry());
window.addEventListener(
  "pagehide",
  () => {
    controller?.dispose();
    m.remove();
  },
  { once: true },
);
