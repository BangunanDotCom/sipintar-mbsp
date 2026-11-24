#!/usr/bin/env bash
# Local only. The two containers share one private network namespace with no exposed ports.
set -euo pipefail
umask 077
work=$(mktemp -d)
backend= proxy= render=
docker_cmd=(docker --host unix:///var/run/docker.sock)
cleanup() {
  if [[ -n "$proxy" ]]; then "${docker_cmd[@]}" rm -f "$proxy" >/dev/null || true; fi
  if [[ -n "$backend" ]]; then "${docker_cmd[@]}" rm -f "$backend" >/dev/null || true; fi
  if [[ -n "$render" ]]; then rm -f "$render/nginx.include.conf" "$render/cloudflared.yaml"; rmdir "$render"; fi
  rm -f "$work"/{nginx.conf,cert.pem,key.pem,backend.mjs,response.json}
  rm -r "$work/web"
  rmdir "$work"
}
trap cleanup EXIT
mkdir -m 755 "$work/web"
printf 'synthetic SPA marker\n' > "$work/web/index.html"
chmod 644 "$work/web/index.html"
openssl req -x509 -newkey rsa:2048 -sha256 -nodes -days 1 -subj '/CN=localhost' \
  -addext 'subjectAltName=DNS:localhost' -keyout "$work/key.pem" -out "$work/cert.pem" 2>/dev/null
export NODE_ENV=development STAYLINK_DEMO_HOST=true STAYLINK_SYNTHETIC_PORTAL=true API_PORT=3001
export APP_ORIGIN=https://staylink-mbsp-demo.example.test
export DATABASE_URL=postgresql://stl_fixture:synthetic-only@127.0.0.1:5432/staylink_issue62_cloudflare_test
export TEST_DATABASE_URL="$DATABASE_URL"
export MFA_ENCRYPTION_KEY="$(openssl rand -hex 32)" IDENTITY_DATA_KEY="$(openssl rand -hex 32)"
export SMTP_HOST=127.0.0.1 SMTP_PORT=1025 SMTP_SECURE=false SMTP_PRODUCTION_ENABLED=false
unset SMTP_USER SMTP_PASSWORD MAIL_FROM
export STAYLINK_DOCUMENT_STORE=disabled STAYLINK_LOCAL_DOCUMENT_STORE_ENABLED=false STAYLINK_CLAMAV_ENABLED=false STAYLINK_DOCUMENT_SCAN_BATCH_ENABLED=false
export CF_DEMO_TUNNEL_ID=25e9de51-937e-4e14-b680-c028336732f5 CF_DEMO_ACCESS_TEAM=stl-fixture
export CF_DEMO_ACCESS_AUDIENCE
CF_DEMO_ACCESS_AUDIENCE=$(printf 'a%.0s' {1..64})
export CF_DEMO_ORIGIN_CA_FILE=/etc/stl/cert.pem CF_DEMO_ORIGIN_CERT_FILE=/etc/stl/cert.pem CF_DEMO_ORIGIN_KEY_FILE=/etc/stl/key.pem
export CF_DEMO_TUNNEL_CREDENTIALS_FILE=/etc/stl/tunnel.json CF_DEMO_WEB_ROOT=/srv/demo
render=$(node deploy/cloudflare/render.mjs)
if [[ -n "${CLOUDFLARED_BIN:-}" ]]; then
  "$CLOUDFLARED_BIN" tunnel --config "$render/cloudflared.yaml" ingress validate
  "$CLOUDFLARED_BIN" tunnel --config "$render/cloudflared.yaml" ingress rule "$APP_ORIGIN/api/health"
fi
{
  printf 'events {}\nhttp {\ninclude /etc/nginx/mime.types;\n'
  cat "$render/nginx.include.conf"
  printf '}\n'
} > "$work/nginx.conf"
cat > "$work/backend.mjs" <<'JS'
import { createServer } from "node:http";
createServer((req, res) => {
  const {cookie, origin} = req.headers;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "public, max-age=300");
  res.setHeader("Set-Cookie", "staylink=fixture; Path=/; Secure; HttpOnly; SameSite=Strict");
  res.end(JSON.stringify({ method: req.method, path: req.url, cookie, origin,
    client: req.headers["x-staylink-demo-client"],
    assertionForwarded: Boolean(req.headers["cf-access-jwt-assertion"]),
    edgeIdentityForwarded: Boolean(req.headers["cf-access-authenticated-user-email"]) }));
}).listen(3001,"127.0.0.1");
JS
backend=$("${docker_cmd[@]}" run -d --network none --mount "type=bind,src=$work/backend.mjs,dst=/fixture.mjs,readonly" \
  node:22.23.5-bookworm@sha256:e13726ca604184d7a91fcacab1fc09eefd642dc28e79ac34e85540dd93b78cfb node /fixture.mjs)
proxy=$("${docker_cmd[@]}" run -d --network "container:$backend" \
  --mount "type=bind,src=$work/nginx.conf,dst=/etc/nginx/nginx.conf,readonly" \
  --mount "type=bind,src=$work/cert.pem,dst=/etc/stl/cert.pem,readonly" \
  --mount "type=bind,src=$work/key.pem,dst=/etc/stl/key.pem,readonly" \
  --mount "type=bind,src=$work/web,dst=/srv/demo,readonly" \
  nginx:1.28-alpine@sha256:a8b39bd9cf0f83869a2162827a0caf6137ddf759d50a171451b335cecc87d236)
local_curl() {
  "${docker_cmd[@]}" exec "$proxy" curl --noproxy '*' --cacert /etc/stl/cert.pem --max-time 5 -sS "$@"
}
url=https://localhost:5443
host='Host: staylink-mbsp-demo.example.test'
edge_address='CF-Connecting-IP: 192.0.2.16'
assertion='Cf-Access-Jwt-Assertion: training-fixture'
for attempt in {1..15}; do
  if local_curl -H "$host" -H "$edge_address" -H "$assertion" "$url/" | grep -q 'synthetic SPA marker'; then break; fi
  sleep 1
done
local_curl -H "$host" -H "$edge_address" -H "$assertion" "$url/dashboard" | grep -q 'synthetic SPA marker'
test "$(local_curl -H "$host" -H "$edge_address" -H "$assertion" -o /dev/null -w '%{http_code}' "$url/assets/absent.js")" = 404
test "$(local_curl -H "$host" -H "$edge_address" -o /dev/null -w '%{http_code}' "$url/api/health")" = 403
test "$(local_curl -H "$host" -H "$assertion" -o /dev/null -w '%{http_code}' "$url/api/health")" = 403
test "$(local_curl -H "$edge_address" -o /dev/null -w '%{http_code}' "$url/api/health")" = 421
local_curl -H "$host" -H "$edge_address" -H 'Origin: https://staylink-mbsp-demo.example.test' \
  -H 'X-Staylink-Demo-Client: 192.0.2.99' -H "$assertion" \
  -H 'Cf-Access-Authenticated-User-Email: fixture@example.test' \
  -H 'Cookie: CF_Authorization=training-fixture; staylink=session-fixture' \
  -X POST -i "$url/api/example" > "$work/response.json"
grep -iq '^Cache-Control: private, no-store, max-age=0' "$work/response.json"
test "$(grep -ic '^Cache-Control:' "$work/response.json")" = 1
grep -iq '^Set-Cookie:.*Secure; HttpOnly; SameSite=Strict' "$work/response.json"
node - "$work/response.json" <<'JS'
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const [, body] = readFileSync(process.argv[2], "utf8").split("\r\n\r\n");
assert.deepEqual(JSON.parse(body), { method: "POST", path: "/api/example",
  cookie: "staylink=session-fixture", origin: "https://staylink-mbsp-demo.example.test",
  client: "192.0.2.16", assertionForwarded: false, edgeIdentityForwarded: false });
JS
printf 'Origin TLS, SPA, no-store, host, IP connector, cookie dan pengasingan header disahkan.\n'
