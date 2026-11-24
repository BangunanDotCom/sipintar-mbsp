#!/usr/bin/env bash
# Provision only an already-created, empty PostgreSQL training database.
set -euo pipefail
umask 077
cd "$(dirname "$0")/../.."
if [[ "${1:-}" == prepare && $# == 2 ]]; then
  previous=
elif [[ "${1:-}" == reset && $# == 3 ]]; then
  previous=$3
  [[ -n "$previous" ]] || exit 2
else
  echo "Gunakan prepare ENV_PRIVAT atau reset ENV_PRIVAT DB_LATIHAN_LAMA." >&2
  exit 2
fi
env_file=$2
if [[ "$env_file" != /* || ! -f "$env_file" || -L "$env_file" ]]; then
  echo "Gunakan laluan mutlak kepada fail konfigurasi privat." >&2
  exit 2
fi
node --env-file="$env_file" --input-type=module - "$env_file" "$previous" <<'JS'
import { lstatSync, realpathSync } from "node:fs";
import { sep } from "node:path";
import { inspectDemoHost, isPersonalDemoDatabase } from "./apps/api/src/demo-host-config.mjs";
const [path, previous] = process.argv.slice(2);
const mode = lstatSync(path);
const real = realpathSync(path);
const { failures, database } = inspectDemoHost(process.env, { requireKit: false });
if (
  real.startsWith(realpathSync(".") + sep) || !mode.isFile() ||
  mode.uid !== process.getuid() || (mode.mode & 0o077) || mode.nlink !== 1 ||
  failures.length || !isPersonalDemoDatabase(database) ||
  (previous && (!isPersonalDemoDatabase(previous) || previous === database))
) {
  console.error("Sasarkan DB Personal Demo baharu. Gunakan fail privat di luar checkout dan semak syarat hos demo.");
  process.exit(2);
}
JS
node --env-file="$env_file" scripts/uat-preflight.mjs empty
node --env-file="$env_file" --import=tsx scripts/migrate.ts --test
node --env-file="$env_file" --import=tsx prisma/seed.ts
kit=$(node --env-file="$env_file" --import=tsx scripts/synthetic-uat-demo.ts |
  sed -n 's/^Kit latihan ditulis ke //p')
[[ -n "$kit" && -f "$kit/portal.env" ]]
node --env-file="$env_file" --env-file="$kit/portal.env" scripts/uat-preflight.mjs kit --kit "$kit"
node --env-file="$env_file" --env-file="$kit/portal.env" --import=tsx scripts/personal-demo-stage.ts "$kit"
printf 'Kit Personal Demo sedia di %s\n' "$kit"
