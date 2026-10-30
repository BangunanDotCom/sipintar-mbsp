import React from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { MapPin } from "lucide-react";
import { readMapConfig } from "./map-config";
import {
  createBasemapController,
  type BasemapState,
} from "./basemap-controller";
import { mountBasemap } from "./map-basemap";
export default function PremisesMap({
  latitude,
  longitude,
  onPick,
  disabled = false,
}: {
  disabled?: boolean;
  latitude: number | null;
  longitude: number | null;
  onPick: (latitude: number, longitude: number) => void;
}) {
  const container = React.useRef<HTMLDivElement>(null),
    map = React.useRef<L.Map | null>(null),
    marker = React.useRef<L.Marker | null>(null),
    pick = React.useRef(onPick),
    placePin = React.useRef<((lat: number, lng: number) => L.LatLng) | null>(
      null,
    );
  pick.current = onPick;
  const enabled = React.useRef(!disabled);
  enabled.current = !disabled;
  const [tileState, setTileState] = React.useState<BasemapState>({
      phase: "loading",
      provider: "primary",
      fallback: false,
    }),
    [center, setCenter] = React.useState({ lat: 5.38, lng: 100.42, zoom: 13 });
  const config = React.useMemo(() => readMapConfig(import.meta.env), []);
  const basemap = React.useRef<ReturnType<
    typeof createBasemapController
  > | null>(null);
  const initial = React.useRef({ latitude, longitude });
  React.useEffect(() => {
    if (!container.current) return;
    const start = initial.current;
    const m = L.map(container.current, {
      scrollWheelZoom: false,
      minZoom: 3,
      maxZoom: 19,
      // Keep one camera transform for raster/vector layers; no competing CSS zoom animation.
      zoomAnimation: false,
      fadeAnimation: !window.matchMedia("(prefers-reduced-motion: reduce)")
        .matches,
      zoomControl: true,
      attributionControl: true,
    }).setView(
      start.latitude !== null && start.longitude !== null
        ? [start.latitude, start.longitude]
        : [5.38, 100.42],
      13,
    );
    map.current = m;
    const icon = L.divIcon({
      className: "premises-pin",
      html: '<span aria-hidden="true"></span>',
      iconSize: [26, 34],
      iconAnchor: [13, 34],
    });
    function pin(lat: number, lng: number) {
      const normalized = L.latLng(
        Math.max(-85, Math.min(85, lat)),
        ((((lng + 180) % 360) + 360) % 360) - 180,
      );
      if (!marker.current) {
        marker.current = L.marker(normalized, {
          icon,
          draggable: true,
          keyboard: true,
          alt: "Pin lokasi premis",
          title: "Pin lokasi premis",
        }).addTo(m);
        marker.current.on("dragend", () => {
          const p = marker.current!.getLatLng();
          const normalized = pin(p.lat, p.lng);
          pick.current(
            Number(normalized.lat.toFixed(6)),
            Number(normalized.lng.toFixed(6)),
          );
        });
      } else marker.current.setLatLng(normalized);
      return normalized;
    }
    placePin.current = pin;
    setCenter({
      lat: m.getCenter().lat,
      lng: m.getCenter().lng,
      zoom: m.getZoom(),
    });
    if (start.latitude !== null && start.longitude !== null)
      pin(start.latitude, start.longitude);
    m.on("click", (e: L.LeafletMouseEvent) => {
      if (!enabled.current) return;
      const p = pin(e.latlng.lat, e.latlng.lng);
      pick.current(Number(p.lat.toFixed(6)), Number(p.lng.toFixed(6)));
    });
    m.on("moveend", () => {
      const p = m.getCenter();
      setCenter({ lat: p.lat, lng: p.lng, zoom: m.getZoom() });
    });
    if (config.issue)
      setTileState({
        phase: "unavailable",
        provider: "primary",
        fallback: false,
        reason: "configuration",
      });
    else
      basemap.current = createBasemapController(
        (provider, events) => mountBasemap(m, config, provider, events),
        setTileState,
        config.fallback !== "none",
      );
    const resize = new ResizeObserver(() =>
      m.invalidateSize({ animate: false }),
    );
    resize.observe(container.current);
    return () => {
      basemap.current?.dispose();
      basemap.current = null;
      resize.disconnect();
      m.remove();
      map.current = null;
      marker.current = null;
      placePin.current = null;
    };
  }, [config]);
  React.useEffect(() => {
    if (disabled) marker.current?.dragging?.disable();
    else marker.current?.dragging?.enable();
  }, [disabled]);
  React.useEffect(() => {
    if (latitude !== null && longitude !== null)
      placePin.current?.(latitude, longitude);
  }, [latitude, longitude]);
  return (
    <section
      className="premises-map-section"
      aria-labelledby="premises-map-title"
    >
      <h3 id="premises-map-title">Pin lokasi premis</h3>
      <p id="map-help">
        Klik peta atau seret pin. Untuk papan kekunci, fokus peta, gerakkan
        dengan kekunci anak panah dan tekan Letak Pin di Tengah Peta.
      </p>
      <p className="map-provider">
        Peta asas:{" "}
        {tileState.provider === "primary"
          ? config.primaryName
          : "OpenFreeMap (alternatif)"}
      </p>
      <div
        className="map-status"
        role="status"
        data-basemap-status={tileState.phase}
        data-basemap-provider={tileState.provider}
      >
        {tileState.phase === "loading" && (
          <p className="map-notice">
            {tileState.fallback
              ? "Peta utama tidak dapat dimuatkan. Mencuba peta alternatif OpenFreeMap…"
              : `Memuatkan peta asas ${config.primaryName}…`}
          </p>
        )}
        {tileState.phase === "ready" && (
          <p className="map-ready">
            Peta asas telah dimuatkan
            {tileState.fallback ? " melalui OpenFreeMap (alternatif)" : ""}.
          </p>
        )}
        {tileState.phase === "unavailable" && (
          <>
            <p className="map-notice">
              {config.issue ||
                "Peta jalan belum dapat dipaparkan. Sumber peta tidak dapat dicapai atau pemapar peta gagal. Grid dan pin sahaja dipaparkan; jangan anggap jalan atau nama lokasi telah disahkan."}
            </p>
            <p className="map-help">
              Semak sambungan rangkaian, penyekat kandungan dan kebenaran sumber
              peta. Anda boleh mencuba semula atau menyemak lokasi pada laman
              peta luar.
            </p>
          </>
        )}
      </div>
      <div className="map-recovery">
        {tileState.phase === "unavailable" && !config.issue && (
          <button
            type="button"
            className="button secondary small"
            disabled={disabled}
            onClick={() => basemap.current?.retry()}
          >
            Cuba Semula Peta
          </button>
        )}
        <a
          className="text-button"
          href={`https://www.openstreetmap.org/#map=${center.zoom}/${latitude ?? center.lat}/${longitude ?? center.lng}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          Buka lokasi di OpenStreetMap ↗
        </a>
      </div>
      <div
        ref={container}
        className="premises-map"
        aria-label="Peta interaktif lokasi premis"
        aria-describedby="map-help"
      />
      <p className="map-center">
        Pusat peta: {center.lat.toFixed(6)}, {center.lng.toFixed(6)} · Zoom{" "}
        {center.zoom}
      </p>
      <button
        type="button"
        className="button secondary small"
        disabled={disabled}
        onClick={() => {
          const p = map.current?.getCenter();
          if (!p) return;
          pick.current(
            Number(Math.max(-85, Math.min(85, p.lat)).toFixed(6)),
            Number((((((p.lng + 180) % 360) + 360) % 360) - 180).toFixed(6)),
          );
        }}
      >
        <MapPin size={16} />
        Letak Pin di Tengah Peta
      </button>
      <div className="premises-coordinates">
        <label>
          Latitude
          <input
            aria-label="Latitude"
            readOnly
            value={latitude ?? ""}
            placeholder="Pilih pin"
          />
        </label>
        <label>
          Longitude
          <input
            aria-label="Longitude"
            readOnly
            value={longitude ?? ""}
            placeholder="Pilih pin"
          />
        </label>
      </div>
      <p className="premises-gis-note">
        Pin ialah pengisytiharan lokasi pengguna. Ia bukan pengesahan rasmi
        sempadan daerah MBSP. Daerah SPU/SPT/SPS dipilih secara berasingan.
      </p>
    </section>
  );
}
