import L from "leaflet";
import { Map as VectorMap, setWorkerUrl } from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import "maplibre-gl/dist/maplibre-gl.css";
import { OPENFREEMAP_STYLE, OPENFREEMAP_ATTRIBUTION } from "./map-config";
import type { BasemapEvents } from "./basemap-controller";
// A local browser rendering worker, never a deployed Cloudflare Worker.
setWorkerUrl(workerUrl);
export function mountOpenFreeMap(
  map: L.Map,
  events: BasemapEvents,
): () => void {
  // A small Leaflet Layer using public MapLibre APIs. All scheduled frames are
  // owned/cancelled here so error/removal cannot leave resize callbacks behind.
  class VectorLayer extends L.Layer {
    private currentMap?: L.Map;
    private renderer?: VectorMap;
    private container?: HTMLDivElement;
    private frame?: number;
    private size?: L.Point;
    private disposed = false;
    private ready = () => {
      const gl = this.renderer;
      if (
        !this.disposed &&
        gl?.isStyleLoaded() &&
        gl.areTilesLoaded() &&
        gl.queryRenderedFeatures().length > 0
      )
        events.ready();
    };
    private failed = () =>
      queueMicrotask(() => {
        if (!this.disposed) events.failed("network-or-provider");
      });
    private schedule = () => {
      if (this.disposed || this.frame !== undefined) return;
      this.frame = requestAnimationFrame(() => {
        this.frame = undefined;
        this.update();
      });
    };
    private update() {
      const m = this.currentMap,
        gl = this.renderer,
        container = this.container;
      if (this.disposed || !m || !gl || !container) return;
      const size = m.getSize(),
        center = m.getCenter();
      L.DomUtil.setPosition(container, m.containerPointToLayerPoint([0, 0]));
      if (!this.size || !size.equals(this.size)) {
        container.style.width = `${size.x}px`;
        container.style.height = `${size.y}px`;
        this.size = size;
        gl.resize();
      }
      // MapLibre's 512-pixel world at z-1 matches Leaflet's 256-pixel world at z.
      gl.jumpTo({ center: [center.lng, center.lat], zoom: m.getZoom() - 1 });
    }
    getEvents() {
      return {
        move: this.schedule,
        zoom: this.schedule,
        resize: this.schedule,
        viewreset: this.schedule,
      };
    }
    onAdd(m: L.Map): this {
      this.currentMap = m;
      this.disposed = false;
      const size = m.getSize(),
        center = m.getCenter();
      this.container = L.DomUtil.create("div", "premises-vector-layer");
      this.container.style.position = "absolute";
      this.container.style.width = `${size.x}px`;
      this.container.style.height = `${size.y}px`;
      L.DomUtil.setPosition(
        this.container,
        m.containerPointToLayerPoint([0, 0]),
      );
      m.getPane("tilePane")!.appendChild(this.container);
      this.renderer = new VectorMap({
        container: this.container,
        style: OPENFREEMAP_STYLE,
        center: [center.lng, center.lat],
        zoom: m.getZoom() - 1,
        interactive: false,
        attributionControl: false,
        renderWorldCopies: false,
      });
      this.renderer.on("dataloading", events.loading);
      this.renderer.on("idle", this.ready);
      this.renderer.on("error", this.failed);
      m.attributionControl.addAttribution(OPENFREEMAP_ATTRIBUTION);
      this.update();
      return this;
    }
    onRemove(m: L.Map): this {
      this.disposed = true;
      if (this.frame !== undefined) cancelAnimationFrame(this.frame);
      this.frame = undefined;
      this.renderer?.off("dataloading", events.loading);
      this.renderer?.off("idle", this.ready);
      this.renderer?.off("error", this.failed);
      this.renderer?.remove();
      this.renderer = undefined;
      this.container?.remove();
      this.container = undefined;
      m.attributionControl.removeAttribution(OPENFREEMAP_ATTRIBUTION);
      this.currentMap = undefined;
      return this;
    }
  }
  const layer = new VectorLayer();
  try {
    layer.addTo(map);
  } catch (error) {
    if (map.hasLayer(layer)) map.removeLayer(layer);
    throw error;
  }
  return () => {
    if (map.hasLayer(layer)) map.removeLayer(layer);
  };
}
