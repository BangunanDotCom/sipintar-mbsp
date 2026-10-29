import React from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { MapPin } from "lucide-react";
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
  const [tileState, setTileState] = React.useState("loading"),
    [center, setCenter] = React.useState({ lat: 5.38, lng: 100.42 });
  const initial = React.useRef({ latitude, longitude });
  React.useEffect(() => {
    if (!container.current) return;
    const start = initial.current;
    const m = L.map(container.current, {
      scrollWheelZoom: false,
      zoomAnimation: !window.matchMedia("(prefers-reduced-motion: reduce)")
        .matches,
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
    setCenter({ lat: m.getCenter().lat, lng: m.getCenter().lng });
    if (start.latitude !== null && start.longitude !== null)
      pin(start.latitude, start.longitude);
    m.on("click", (e: L.LeafletMouseEvent) => {
      if (!enabled.current) return;
      const p = pin(e.latlng.lat, e.latlng.lng);
      pick.current(Number(p.lat.toFixed(6)), Number(p.lng.toFixed(6)));
    });
    m.on("moveend", () => {
      const p = m.getCenter();
      setCenter({ lat: p.lat, lng: p.lng });
    });
    const tiles = L.tileLayer(
      "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
      {
        maxZoom: 19,
        minZoom: 3,
        noWrap: true,
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors',
      },
    );
    let loaded = false,
      failed = false;
    tiles.on("tileload", () => {
      loaded = true;
      if (!failed) setTileState("ready");
    });
    tiles.on("tileerror", () => {
      failed = true;
      setTileState("unavailable");
    });
    tiles.addTo(m);
    const timer = setTimeout(() => {
      if (!loaded) setTileState("unavailable");
    }, 6000);
    const resize = new ResizeObserver(() =>
      m.invalidateSize({ animate: false }),
    );
    resize.observe(container.current);
    return () => {
      clearTimeout(timer);
      resize.disconnect();
      m.remove();
      map.current = null;
      marker.current = null;
      placePin.current = null;
    };
  }, []);
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
      {tileState === "loading" && (
        <p className="map-notice" role="status">
          Memuatkan peta asas OpenStreetMap…
        </p>
      )}
      {tileState === "unavailable" && (
        <p className="map-notice" role="status">
          Peta asas tidak dapat dimuatkan. Paparan grid sahaja; tiada jalan atau
          alamat dipaparkan. Pemilihan koordinat masih berfungsi, tetapi semak
          lokasi pada peta yang boleh dicapai sebelum meneruskan.
        </p>
      )}
      <div
        ref={container}
        className="premises-map"
        aria-label="Peta interaktif lokasi premis"
        aria-describedby="map-help"
      />
      <p className="map-center">
        Pusat peta: {center.lat.toFixed(6)}, {center.lng.toFixed(6)}
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
