import L from "leaflet";
import type { BasemapEvents } from "./basemap-controller";
import type { MapConfig, MapProvider } from "./map-config";
export async function mountBasemap(
  map: L.Map,
  config: MapConfig,
  provider: MapProvider,
  events: BasemapEvents,
): Promise<() => void> {
  if (provider === "openfreemap") {
    const { mountOpenFreeMap } = await import("./map-openfreemap");
    if (!events.active()) return () => {};
    return mountOpenFreeMap(map, events);
  }
  const layer = L.tileLayer(config.primaryUrl, {
    minZoom: 3,
    maxZoom: 19,
    noWrap: true,
    attribution: config.primaryAttribution,
    referrerPolicy: "strict-origin-when-cross-origin",
    keepBuffer: 1,
  });
  // Track only current tiles. Unloaded/previously failed tiles must not poison future views.
  const current = new Map<HTMLElement, "loading" | "ready" | "failed">();
  layer.on("loading", events.loading);
  layer.on("tileloadstart", (event: L.TileEvent) =>
    current.set(event.tile, "loading"),
  );
  layer.on("tileload", (event: L.TileEvent) => {
    if (current.has(event.tile)) current.set(event.tile, "ready");
  });
  layer.on("tileerror", (event: L.TileErrorEvent) => {
    if (current.has(event.tile)) current.set(event.tile, "failed");
  });
  layer.on("tileunload", (event: L.TileEvent) => current.delete(event.tile));
  layer.on("load", () => {
    const statuses = [...current.values()];
    if (statuses.some((s) => s === "failed"))
      queueMicrotask(() => events.failed());
    else if (
      statuses.some((s) => s === "ready") &&
      !statuses.includes("loading")
    )
      events.ready();
  });
  layer.addTo(map);
  return () => {
    // Leaflet's remove event unregisters map-level zoom/move listeners first.
    if (map.hasLayer(layer)) map.removeLayer(layer);
    layer.off();
    current.clear();
  };
}
