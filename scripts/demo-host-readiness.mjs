#!/usr/bin/env node
// Read-only readiness check. No network, DB connections, migrations or secret output.
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const failures = [];
const warnings = [];
const ok = [];
const required = ["APP_ORIGIN", "DATABASE_URL", "TEST_DATABASE_URL", "MFA_ENCRYPTION_KEY", "IDENTITY_DATA_KEY"];
const enabled = (name) => process.env[name] === "true";
const disabled = (name) => process.env[name] === "false";
const fail = (message) => failures.push(message);
const warn = (message) => warnings.push(message);
const pass = (message) => ok.push(message);
const value = (name) => process.env[name]?.trim() || "";

for (const name of required) {
  if (!value(name)) fail(`${name}: belum ditetapkan.`);
}
if (Number(process.versions.node.split(".")[0]) < 22) fail("Node.js 22+ diperlukan.");
else pass("Versi Node.js sesuai.");

if (!enabled("STAYLINK_SYNTHETIC_PORTAL")) fail("Mod portal sintetik mesti diaktifkan.");
if (!disabled("SMTP_PRODUCTION_ENABLED")) fail("SMTP_PRODUCTION_ENABLED mesti false.");
if (!disabled("STAYLINK_LOCAL_DOCUMENT_STORE_ENABLED")) fail("Storan dokumen tempatan mesti dimatikan.");
if (value("STAYLINK_DOCUMENT_STORE") !== "disabled") fail("STAYLINK_DOCUMENT_STORE mesti disabled.");
if (!disabled("STAYLINK_CLAMAV_ENABLED") || !disabled("STAYLINK_DOCUMENT_SCAN_BATCH_ENABLED")) {
  fail("Tetapan imbasan dokumen latihan mesti dinyahaktifkan mengikut kit UAT.");
}
if (value("SMTP_HOST") !== "127.0.0.1" || value("SMTP_PORT") !== "1025") {
  fail("SMTP latihan mesti menggunakan Mailpit loopback 127.0.0.1:1025.");
}
for (const name of ["SMTP_USER", "SMTP_PASSWORD", "MAIL_FROM"]) {
  if (value(name)) fail(`${name} tidak boleh ditetapkan untuk demo latihan.`);
}
if (value("MFA_ENCRYPTION_KEY") && value("IDENTITY_DATA_KEY") &&
    value("MFA_ENCRYPTION_KEY") === value("IDENTITY_DATA_KEY")) {
  fail("Kunci MFA dan identiti mesti berasingan.");
}
for (const name of ["DATABASE_URL", "TEST_DATABASE_URL"]) {
  const raw = value(name);
  if (!raw) continue;
  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase();
    if (!["127.0.0.1", "localhost", "::1", "[::1]"].includes(host)) {
      fail(`${name}: hanya pangkalan data loopback dibenarkan dalam pemeriksaan awal ini.`);
    }
    if (!url.pathname.slice(1).endsWith("_test")) fail(`${name}: nama pangkalan data mesti berakhir _test.`);
  } catch {
    fail(`${name}: URL pangkalan data tidak sah.`);
  }
}
if (value("DATABASE_URL") && value("TEST_DATABASE_URL") &&
    value("DATABASE_URL") !== value("TEST_DATABASE_URL")) {
  fail("DATABASE_URL dan TEST_DATABASE_URL mesti merujuk DB latihan yang sama.");
}
try {
  const origin = new URL(value("APP_ORIGIN"));
  if (!["https:", "http:"].includes(origin.protocol)) fail("APP_ORIGIN: protokol tidak sah.");
  if (origin.protocol === "http:" && !["localhost", "127.0.0.1"].includes(origin.hostname)) {
    fail("APP_ORIGIN bukan loopback mesti menggunakan HTTPS.");
  }
} catch {
  if (value("APP_ORIGIN")) fail("APP_ORIGIN: URL tidak sah.");
}
const dist = resolve("apps/web/dist/index.html");
if (existsSync(dist)) pass("Binaan frontend ditemui.");
else warn("Binaan frontend belum ditemui; jalankan npm run build sebelum handover.");
if (existsSync(resolve("node_modules"))) pass("Kebergantungan npm ditemui.");
else warn("node_modules belum ditemui; jalankan npm ci.");
const output = {
  status: failures.length ? "BLOCKED" : warnings.length ? "CHECK" : "READY_FOR_TECHNICAL_REVIEW",
  passed: ok, warnings, failures,
  note: "Read-only static checks only. Does not certify server, HTTPS, firewall, database content, access control, UAT or JTIK approval.",
};
process.stdout.write(JSON.stringify(output, null, 2) + "\n");
if (failures.length) process.exitCode = 1;
