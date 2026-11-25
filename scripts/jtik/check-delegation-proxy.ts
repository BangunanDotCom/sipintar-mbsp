import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { createInterface } from "node:readline";
import { z } from "zod";

if (process.env.STAYLINK_JTIK_SYNTHETIC_PROBE !== "true")
  throw Error(
    "Gunakan proksi staging yang diluluskan dengan identiti sintetik.",
  );

const config = z
  .object({
    origin: z.url(),
    documentId: z.uuid(),
    ownerCookie: z.string().regex(/^staylink=[A-Za-z0-9_-]+$/),
    outsiderCookie: z.string().regex(/^staylink=[A-Za-z0-9_-]+$/),
    fixturePath: z.string().min(1),
    accessLog: z.string().min(1),
  })
  .parse(JSON.parse(await readFile(process.argv[2], "utf8")));
const origin = new URL(config.origin);
if (
  origin.protocol !== "https:" ||
  origin.origin !== config.origin ||
  config.ownerCookie === config.outsiderCookie
)
  throw Error("Gunakan HTTPS dan dua sesi sintetik yang berasingan.");

const offset = (await stat(config.accessLog)).size;
const canary = randomUUID();
const target = new URL("/api/documents/" + config.documentId, origin);
target.searchParams.set("redactionProbe", canary);
const fixture = await readFile(config.fixturePath);
for (const [cookie, code] of [
  [config.ownerCookie, 200],
  [config.outsiderCookie, 404],
  [config.ownerCookie, 200],
] as const) {
  const response = await fetch(target, {
    headers: { cookie },
    redirect: "error",
    signal: AbortSignal.timeout(10_000),
  });
  const bytes = Buffer.from(await response.arrayBuffer());
  if (
    response.status !== code ||
    !response.headers.get("cache-control")?.includes("no-store") ||
    (code === 200
      ? !bytes.equals(fixture) ||
        !response.headers.get("content-disposition")?.includes("attachment")
      : bytes.includes(fixture) || response.headers.has("content-disposition"))
  )
    throw Error("Asersi lampiran, cache atau pengasingan proksi gagal.");
}

let count = 0;
const lines = createInterface({
  input: createReadStream(config.accessLog, { start: offset }),
});
for await (const line of lines) {
  if (
    [
      canary,
      config.ownerCookie,
      config.outsiderCookie,
      fixture.toString("base64"),
    ].some((value) => line.includes(value)) ||
    /(?:set-cookie|authorization|cookie=|%PDF-)/i.test(line)
  )
    throw Error("Asersi redaksi log proksi gagal.");
  if (line.includes(target.pathname)) count++;
}
if (count < 3) throw Error("Log tidak mempunyai ketiga-tiga permintaan probe.");
console.log(
  "Proxy isolation, no-store, HTTPS and access-log redaction verified.",
);
