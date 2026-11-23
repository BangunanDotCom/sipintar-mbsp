#!/usr/bin/env node
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { inspectDemoHost } from "../apps/api/src/demo-host-config.mjs";

try {
  const { values } = parseArgs({ options: { prepare: { type: "boolean" } } });
  const { failures } = inspectDemoHost(process.env, {
    requireKit: !values.prepare,
  });
  const [major, minor] = process.versions.node.split(".").map(Number);
  if (major < 22 || (major === 22 && minor < 12))
    failures.push("Gunakan Node.js 22.12 atau versi LTS yang lebih baharu.");
  const warnings = [];
  const passed = [];
  for (const [path, name, advice] of [
    ["apps/web/dist/index.html", "Binaan React", "npm run build"],
    ["node_modules/tsx/package.json", "Kebergantungan Node", "npm ci"],
    ["node_modules/.prisma/client/index.js", "Prisma", "npm run db:generate"],
  ]) {
    if (existsSync(resolve(path))) passed.push(`${name} ditemui.`);
    else warnings.push(`${name} belum tersedia. Jalankan ${advice}.`);
  }
  console.log(
    JSON.stringify(
      {
        status: failures.length
          ? "BLOCKED"
          : warnings.length
            ? "CHECK"
            : "READY_FOR_TECHNICAL_REVIEW",
        passed,
        warnings,
        failures,
        note: "Pemeriksaan statik sahaja. Jalankan preflight UAT bagi semakan PostgreSQL, Mailpit, polisi dan kit.",
      },
      null,
      2,
    ),
  );
  if (failures.length || warnings.length) process.exitCode = 1;
} catch {
  console.error(
    "Pemeriksaan statik gagal. Gunakan pilihan --prepare sebelum penjanaan kit.",
  );
  process.exitCode = 1;
}
