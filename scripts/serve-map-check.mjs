import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath, URL } from "node:url";
import { resolve } from "node:path";

const root = new URL("../docs/previews/", import.meta.url);
const allowed =
  /^(?:map-check\.html|assets\/maplibre-gl-worker-[\w-]+\.js|licenses\/(?:leaflet|maplibre-gl)\.txt)$/;
export function createMapCheckServer() {
  return createServer(async (request, response) => {
    const headers = {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      // Inline library code/CSS is bundled here; worker scripts remain same-origin.
      "Content-Security-Policy":
        "default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://tile.openstreetmap.org https://tiles.openfreemap.org; connect-src 'self' https://tiles.openfreemap.org; worker-src 'self'; font-src 'self'; base-uri 'none'; frame-ancestors 'none'",
    };
    const path = (request.url || "/").split("?")[0];
    const name = path === "/" ? "map-check.html" : path.slice(1);
    if (!allowed.test(name)) {
      response.writeHead(404, headers);
      response.end("Not found");
      return;
    }
    if (!["GET", "HEAD"].includes(request.method || "")) {
      response.writeHead(405, { ...headers, Allow: "GET, HEAD" });
      response.end();
      return;
    }
    try {
      const data = await readFile(new URL(name, root));
      response.writeHead(200, {
        ...headers,
        "Content-Type": name.endsWith(".js")
          ? "text/javascript; charset=utf-8"
          : name.endsWith(".html")
            ? "text/html; charset=utf-8"
            : "text/plain; charset=utf-8",
        "Content-Length": data.byteLength,
      });
      response.end(request.method === "HEAD" ? undefined : data);
    } catch {
      response.writeHead(404, headers);
      response.end("Not found");
    }
  });
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const option = (name, fallback) => {
    const index = process.argv.indexOf(name);
    return index < 0 ? fallback : process.argv[index + 1];
  };
  const host = option("--host", "127.0.0.1");
  const port = Number(option("--port", "5174"));
  if (
    !["127.0.0.1", "0.0.0.0"].includes(host) ||
    !Number.isInteger(port) ||
    port < 1024 ||
    port > 65535
  )
    throw new Error("Invalid diagnostic host/port");
  const server = createMapCheckServer();
  server.on("error", () => {
    console.error(
      "Pelayan diagnostik gagal bermula. Semak port yang sedang digunakan.",
    );
    process.exitCode = 1;
  });
  server.listen(port, host, () =>
    console.log(
      `Diagnostik peta: http://${host === "0.0.0.0" ? "localhost" : host}:${port}/map-check.html (pada komputer pelayan ini sahaja)`,
    ),
  );
}
