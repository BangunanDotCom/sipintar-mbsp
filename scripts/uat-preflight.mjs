#!/usr/bin/env node
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
try {
  if (Number(process.versions.node.split(".")[0]) < 22)
    throw Error("Gunakan Node.js versi 22 atau lebih baharu.");
  for (const [name, instruction] of [
    ["tsx/esm/api", "Jalankan npm ci untuk memasang kebergantungan."],
    ["dotenv", "Jalankan npm ci untuk memasang kebergantungan."],
    ["pg", "Jalankan npm ci untuk memasang kebergantungan."],
    ["argon2", "Jalankan npm ci untuk memasang kebergantungan."],
    [
      ".prisma/client/index",
      "Jalankan npm run db:generate untuk menjana klien Prisma.",
    ],
  ]) {
    try {
      require.resolve(name);
    } catch {
      throw Error(instruction);
    }
  }
  const { tsImport } = await import("tsx/esm/api");
  const { runPreflight } = await tsImport(
    "./uat-preflight.ts",
    import.meta.url,
  );
  await runPreflight(process.argv.slice(2));
} catch (error) {
  process.exitCode = 1;
  console.error(
    error instanceof Error && error.name === "PreflightError"
      ? error.message
      : error instanceof Error &&
          /^(?:Gunakan Node\.js|Jalankan npm )/.test(error.message)
        ? error.message
        : "Pemeriksaan awal gagal. Semak pemasangan, migrasi dan sambungan latihan.",
  );
}
