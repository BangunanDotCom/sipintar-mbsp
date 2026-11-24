#!/usr/bin/env bash
# Local synthetic rehearsal only. A short-lived Nginx container binds loopback.
set -euo pipefail
umask 077
if [[ $# != 1 || ! "${APP_ORIGIN:-}" =~ ^https://localhost:(5443|5444)$ ||
      "${STAYLINK_DEMO_HOST:-}" != true ]]; then
  echo "Gunakan konfigurasi latihan tempatan dan portal.env kit." >&2
  exit 2
fi
host_port=${BASH_REMATCH[1]}
# Refuse to reuse an existing API or HTTPS listener.
node --input-type=module - "$host_port" <<'JS'
import { createServer } from "node:net";
for (const port of [3001, Number(process.argv[2])]) {
  await new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => server.close(resolve));
  }).catch(() => {
    console.error(`Port latihan setempat ${port} tidak tersedia.`);
    process.exit(2);
  });
}
JS
kit_env=$1
kit_dir=$(dirname "$kit_env")
node --env-file="$kit_env" scripts/demo-host-readiness.mjs
node --env-file="$kit_env" scripts/uat-preflight.mjs kit --kit "$kit_dir"
if [[ "$host_port" == 5444 ]]; then
  node --env-file="$kit_env" --import=tsx scripts/personal-demo-stage.ts "$kit_dir"
fi

work=$(mktemp -d)
api_pid=""
nginx_id=""
docker_cmd=(docker --host unix:///var/run/docker.sock)
cleanup() {
  if [[ -n "$nginx_id" ]]; then "${docker_cmd[@]}" rm -f "$nginx_id" >/dev/null; fi
  if [[ -n "$api_pid" ]]; then kill "$api_pid" 2>/dev/null || true; wait "$api_pid" 2>/dev/null || true; fi
  rm -f "$work"/{nginx.conf,cert.pem,key.pem,api.log}
  if [[ -d "$work/web" ]]; then rm -r "$work/web"; fi
  rmdir "$work"
}
trap cleanup EXIT
# Stage only public React assets; local workspaces can build under umask 077.
cp -R apps/web/dist "$work/web"
chmod -R a+rX "$work/web"
openssl req -x509 -newkey rsa:2048 -sha256 -nodes -days 1 -subj '/CN=localhost' \
  -addext 'subjectAltName=DNS:localhost,IP:127.0.0.1' -keyout "$work/key.pem" -out "$work/cert.pem" 2>/dev/null
{
  printf 'events {}\nhttp {\ninclude /etc/nginx/mime.types;\n'
  sed -e "s/DEMO_BIND_IP:443/127.0.0.1:$host_port/" -e 's/DEMO_FQDN/localhost/g' \
    -e 's|DEMO_CERT_KEY_FILE|/tmp/demo-key.pem|' -e 's|DEMO_CERT_FILE|/tmp/demo-cert.pem|' \
    -e 's|DEMO_WEB_ROOT|/srv/demo|' -e 's|DEMO_ACCESS_LOG|/dev/stdout|' \
    -e 's|DEMO_ERROR_LOG|/dev/stderr|' deploy/demo/linux/staylink-demo.nginx.conf
  printf '}\n'
} > "$work/nginx.conf"

node --env-file="$kit_env" --import=tsx apps/api/src/index.ts > "$work/api.log" 2>&1 &
api_pid=$!
for _ in {1..30}; do
  if ! kill -0 "$api_pid" 2>/dev/null; then echo "API demo tidak dapat dimulakan." >&2; exit 1; fi
  if curl -fsS --max-time 2 http://127.0.0.1:3001/api/health >/dev/null 2>&1; then break; fi
  sleep 1
done
curl -fsS --max-time 3 http://127.0.0.1:3001/api/health >/dev/null
image=nginx:1.28-alpine@sha256:a8b39bd9cf0f83869a2162827a0caf6137ddf759d50a171451b335cecc87d236
volumes=(
  --mount "type=bind,src=$work/nginx.conf,dst=/etc/nginx/nginx.conf,readonly"
  --mount "type=bind,src=$work/key.pem,dst=/tmp/demo-key.pem,readonly"
  --mount "type=bind,src=$work/cert.pem,dst=/tmp/demo-cert.pem,readonly"
  --mount "type=bind,src=$work/web,dst=/srv/demo,readonly"
)
"${docker_cmd[@]}" run --rm "${volumes[@]}" "$image" nginx -t
nginx_id=$("${docker_cmd[@]}" run -d --network host "${volumes[@]}" "$image")
for _ in {1..20}; do
  if curl -fsS --cacert "$work/cert.pem" --max-time 3 "$APP_ORIGIN/api/health" >/dev/null 2>&1; then break; fi
  sleep 1
done
curl -fsS --cacert "$work/cert.pem" --max-time 3 "$APP_ORIGIN/api/health" >/dev/null
export STAYLINK_HTTPS_REHEARSAL=true
export STAYLINK_UAT_KIT_FILE="$kit_dir/accounts.json"
suite=(tests/e2e/synthetic-portal.spec.ts tests/e2e/demo-host.spec.ts)
if [[ "$host_port" == 5444 ]]; then
  suite=(tests/e2e/personal-demo.spec.ts)
fi
node --env-file="$kit_env" node_modules/@playwright/test/cli.js test "${suite[@]}"
