import { createServer as httpServer, request } from "node:http";
import { createServer as httpsServer } from "node:https";
import { readFile } from "node:fs/promises";

if (
  process.env.STAYLINK_TEST_PARITY_PROXY !== "true" ||
  process.argv.length !== 4
)
  throw Error(
    "Use the synthetic loopback parity proxy with a local TLS key and certificate.",
  );

const key = await readFile(process.argv[2]);
const cert = await readFile(process.argv[3]);

function forward(req, reply) {
  const api = req.url === "/api" || req.url.startsWith("/api/");
  const marker = req.headers["x-staylink-demo-client"];
  const match =
    typeof marker === "string" && /^192\.0\.2\.([1-9]\d{0,2})$/.exec(marker);
  const client = match ? Number(match[1]) : 0;
  // Each synthetic browser persona uses a separate loopback source. Backend
  // rate limits remain active, including in Oracle HTTP mode.
  const upstream = request(
    {
      hostname: "127.0.0.1",
      localAddress:
        api && client >= 1 && client <= 223
          ? "127.0.0." + (client + 1)
          : "127.0.0.1",
      port: api ? 3001 : 5174,
      path: req.url,
      method: req.method,
      headers: req.headers,
    },
    (response) => {
      reply.writeHead(response.statusCode, response.headers);
      response.pipe(reply);
    },
  );
  upstream.on("error", () => {
    if (!reply.headersSent) reply.writeHead(502);
    reply.end();
  });
  req.pipe(upstream);
}
httpServer(forward).listen(5173, "127.0.0.1");
httpsServer({ key, cert }, forward).listen(5443, "127.0.0.1");
