import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";

// Use Vite's emitted JavaScript file, never a CDN redirect or a Blob from file://.
export function resolveMapWorkerUrl(
  pageUrl = location.href,
  assetUrl = workerUrl,
): string {
  const page = new URL(pageUrl);
  if (!["http:", "https:"].includes(page.protocol))
    throw new Error("Peta memerlukan HTTP/HTTPS. Jangan buka melalui file://.");
  const worker = new URL(assetUrl, page);
  if (
    !["http:", "https:"].includes(worker.protocol) ||
    worker.origin !== page.origin ||
    worker.username ||
    worker.password
  )
    throw new Error(
      "Worker peta mesti disediakan daripada origin HTTP/HTTPS portal yang sama.",
    );
  return worker.href;
}
