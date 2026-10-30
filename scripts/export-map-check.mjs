import { build, transformWithEsbuild } from "vite";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath, URL } from "node:url";
import { Buffer } from "node:buffer";
import { deflateRawSync } from "node:zlib";
const root = fileURLToPath(new URL("../", import.meta.url)),
  output = new URL("../docs/previews/", import.meta.url);
const common = {
  configFile: false,
  root: new URL("../work/", import.meta.url).pathname,
  publicDir: false,
  logLevel: "error",
  build: {
    write: false,
    minify: "esbuild",
    assetsInlineLimit: Infinity,
    cssCodeSplit: false,
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
};
const workerPath = `${root}node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs`;
const { code: workerCode } = await transformWithEsbuild(
  await readFile(workerPath, "utf8"),
  workerPath,
  { format: "iife", minify: true, sourcemap: false },
);
const bundle = await build({
  ...common,
  plugins: [
    {
      name: "standalone-inline-map-worker",
      enforce: "pre",
      resolveId(id) {
        if (id.endsWith("maplibre-gl-worker.mjs?worker&url"))
          return "\0staylink-inline-worker";
      },
      load(id) {
        if (id === "\0staylink-inline-worker")
          return `const workerUrl=URL.createObjectURL(new Blob([${JSON.stringify(workerCode)}],{type:"text/javascript"}));export default workerUrl;`;
      },
    },
  ],
  build: {
    ...common.build,
    lib: {
      entry: `${root}apps/web/src/map-check-download.ts`,
      formats: ["iife"],
      name: "STAYLinkMapCheck",
    },
  },
});
const bundledOutput = Array.isArray(bundle)
  ? bundle.flatMap((result) => result.output)
  : bundle.output;
const js = bundledOutput
  .filter((x) => x.type === "chunk")
  .map((x) => x.code)
  .join("\n")
  .replace(/<\/script/gi, "<\\/script")
  .replace(/<script/gi, "<\\x73cript")
  .replace(/<!--/g, "<\\x21--");
const css = bundledOutput
  .filter((x) => x.type === "asset" && x.fileName.endsWith(".css"))
  .map((x) => x.source)
  .join("\n")
  .replace(/<\/style/gi, "<\\/style");
const html = `<!doctype html><html lang="ms"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>STAYLink MBSP — Ujian Peta Tanpa Pemasangan</title><style>${css}
body{margin:0;background:#eff5fa;color:#163655;font:16px/1.7 system-ui}header{padding:24px;background:#062345;color:white}main{max-width:1100px;margin:24px auto;padding:0 20px}h1{font-size:clamp(24px,4vw,36px);margin:0}h2{font-size:20px}section{background:white;border:1px solid #cedde9;border-radius:12px;padding:20px;margin:20px 0}#map{height:500px;background:#e5edf2;isolation:isolate}.status{padding:12px;border-left:4px solid #c6a343;background:#fff9e8;overflow-wrap:anywhere}button,a.button{font:inherit;display:inline-block;padding:10px 16px;margin:8px 12px 8px 0;background:#0b2d6b;color:white;border:0;border-radius:8px;text-decoration:none}button:disabled{opacity:.5}a{color:#0b57a4}.coords{display:flex;gap:20px;flex-wrap:wrap}label{display:block}input{display:block;padding:10px;font:inherit;max-width:100%;box-sizing:border-box}.maplibregl-map,.maplibregl-canvas{pointer-events:none}.test-pin span{display:block;width:25px;height:25px;background:#0b2d6b;border:3px solid #dfb94f;border-radius:50% 50% 50% 0;transform:rotate(-45deg)}small{display:block}footer{font-size:13px;color:#526b87;margin:25px 0}@media(max-width:600px){#map{height:350px}main{padding:0 12px}section{padding:16px}}
</style></head><body><header><h1>STAYLink MBSP — Ujian Peta</h1><p>Fail kendiri · Tanpa Node.js, terminal, localhost atau login</p></header><main><p>Ini alat semakan sumber peta, bukan portal penuh atau penghantaran permohonan. Kod pemapar/controller sama seperti portal. Internet masih diperlukan untuk mendapatkan peta sebenar.</p><section><h2>Semak peta jalan</h2><p id="map-source"></p><p id="map-result" class="status" role="status" data-status="loading">Memuatkan…</p><button id="retry" type="button" disabled>Cuba Semula</button><div id="map" aria-label="Peta ujian STAYLink"></div><p>Pusat awal contoh: Seberang Perai. Klik peta atau seret pin untuk mencuba koordinat.</p><button id="center-pin" type="button">Letak Pin di Tengah Peta</button><div class="coords"><label>Latitude<input id="latitude" readonly></label><label>Longitude<input id="longitude" readonly></label></div><small>Pin tidak mengesahkan sempadan rasmi daerah MBSP. Tiada maklumat disimpan atau dihantar ke backend STAYLink.</small></section><section><h2>Bagaimana mengesahkan?</h2><ol><li>Tunggu READY dan pastikan jalan serta nama lokasi benar-benar kelihatan.</li><li>Cuba zoom, klik dan seret pin. Koordinat sepatutnya berubah.</li><li>Jika UNAVAILABLE, semak sambungan internet atau sekatan ke tiles.openfreemap.org. Status gagal tidak bermaksud peta berjaya.</li></ol><a class="button" href="https://www.openstreetmap.org/#map=15/5.38/100.42" target="_blank" rel="noopener noreferrer">Buka peta OSM dalam tab baharu</a><small>Pautan luar itu menguji penyedia sahaja, bukan portal STAYLink.</small></section><footer>Library Leaflet / MapLibre dibundel tempatan; data peta langsung daripada penyedia yang dinyatakan, dengan atribusi pada peta. Tiada jubin arkib atau geografi sintetik dibundel. Fail tempatan menggunakan OpenFreeMap kerana jubin OSM memerlukan Referer HTTP yang sah.</footer></main><script>${js}</script></body></html>`;
await mkdir(output, { recursive: true });
await writeFile(new URL("map-check.html", output), html);
// Small deterministic ZIP using Node built-ins; users use their OS's built-in Extract All.
function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function zip(entries) {
  const locals = [],
    central = [];
  let offset = 0;
  for (const [name, contents] of entries) {
    const filename = Buffer.from(name),
      data = Buffer.from(contents),
      compressed = deflateRawSync(data),
      crc = crc32(data);
    const head = Buffer.alloc(30);
    head.writeUInt32LE(0x04034b50);
    head.writeUInt16LE(20, 4);
    head.writeUInt16LE(0x800, 6);
    head.writeUInt16LE(8, 8);
    head.writeUInt16LE(33, 12);
    head.writeUInt32LE(crc, 14);
    head.writeUInt32LE(compressed.length, 18);
    head.writeUInt32LE(data.length, 22);
    head.writeUInt16LE(filename.length, 26);
    locals.push(head, filename, compressed);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50);
    c.writeUInt16LE(20, 4);
    c.writeUInt16LE(20, 6);
    c.writeUInt16LE(0x800, 8);
    c.writeUInt16LE(8, 10);
    c.writeUInt16LE(33, 14);
    c.writeUInt32LE(crc, 16);
    c.writeUInt32LE(compressed.length, 20);
    c.writeUInt32LE(data.length, 24);
    c.writeUInt16LE(filename.length, 28);
    c.writeUInt32LE(offset, 42);
    central.push(c, filename);
    offset += head.length + filename.length + compressed.length;
  }
  const directory = Buffer.concat(central),
    end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}
const instructions =
  "UJIAN PETA STAYLink MBSP — TANPA PEMASANGAN\n\n1. Gunakan Extract All pada ZIP ini.\n2. Buka map-check.html dengan Google Chrome (Open with > Google Chrome).\n3. Tunggu READY dan semak jalan/nama lokasi secara visual.\n4. Jika UNAVAILABLE, peta belum berjaya; semak internet/sekatan penyedia.\n\nTiada Node.js, terminal, localhost, akaun atau database diperlukan. Internet diperlukan untuk peta sebenar. Fail ini alat ujian peta sahaja, bukan portal penuh. Tiada data peribadi dibundel.\n";
const entries = [
  ["map-check.html", html],
  ["BACA-DAHULU.txt", instructions],
  [
    "licenses/leaflet.txt",
    await readFile(`${root}apps/web/public/licenses/leaflet.txt`),
  ],
  [
    "licenses/maplibre-gl.txt",
    await readFile(`${root}apps/web/public/licenses/maplibre-gl.txt`),
  ],
];
const archive = zip(entries);
await writeFile(new URL("staylink-map-check.zip", output), archive);
console.log(
  JSON.stringify({
    html: "docs/previews/map-check.html",
    htmlBytes: Buffer.byteLength(html),
    zip: "docs/previews/staylink-map-check.zip",
    zipBytes: archive.length,
  }),
);
