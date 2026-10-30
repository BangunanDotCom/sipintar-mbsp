export type MapProvider = "primary" | "openfreemap";
export type MapConfig = {
  primaryUrl: string;
  primaryAttribution: string;
  primaryName: string;
  fallback: "openfreemap" | "none";
  issue?: string;
};
export const OSM_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
export const OPENFREEMAP_STYLE = "https://tiles.openfreemap.org/styles/liberty";
const osmAttribution =
  '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors';
export const OPENFREEMAP_ATTRIBUTION =
  '<a href="https://openfreemap.org/" target="_blank" rel="noopener noreferrer">OpenFreeMap</a> &copy; <a href="https://www.openmaptiles.org/" target="_blank" rel="noopener noreferrer">OpenMapTiles</a> Data from <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>';
export function readMapConfig(
  env: Record<string, string | undefined>,
): MapConfig {
  const url = env.VITE_MAP_PRIMARY_URL?.trim() || OSM_URL;
  const attribution = env.VITE_MAP_PRIMARY_ATTRIBUTION?.trim() || "";
  const fallback = env.VITE_MAP_FALLBACK || "openfreemap";
  const config: MapConfig = {
    primaryUrl: url,
    primaryName: url === OSM_URL ? "OpenStreetMap" : "Penyedia diluluskan",
    primaryAttribution:
      url === OSM_URL
        ? osmAttribution
        : attribution.replace(
            /[&<>"']/g,
            (c) =>
              ({
                "&": "&amp;",
                "<": "&lt;",
                ">": "&gt;",
                '"': "&quot;",
                "'": "&#39;",
              })[c]!,
          ),
    fallback: fallback === "none" ? "none" : "openfreemap",
  };
  try {
    const parsed = new URL(url);
    if (
      parsed.protocol !== "https:" ||
      parsed.username ||
      parsed.password ||
      parsed.hash ||
      !["{z}", "{x}", "{y}"].every((p) => url.includes(p))
    )
      throw Error();
    if (url !== OSM_URL && !attribution) throw Error();
    if (!["openfreemap", "none"].includes(fallback)) throw Error();
  } catch {
    config.issue =
      "Konfigurasi sumber peta tidak sah. Gunakan URL HTTPS XYZ dan atribusi penyedia yang dibenarkan.";
  }
  return config;
}
