import { expect, it } from "vitest";
import { buildCloudflareDemoConfig } from "../deploy/cloudflare/render.mjs";

const database =
  "postgresql://stl_fixture:synthetic-only@127.0.0.1:5432/staylink_issue62_cloudflare_test";
const local = {
  APP_ORIGIN: "https://staylink-mbsp-demo.example.test",
  NODE_ENV: "development",
  STAYLINK_DEMO_HOST: "true",
  STAYLINK_SYNTHETIC_PORTAL: "true",
  API_PORT: "3001",
  DATABASE_URL: database,
  TEST_DATABASE_URL: database,
  MFA_ENCRYPTION_KEY: "ab".repeat(32),
  IDENTITY_DATA_KEY: "cd".repeat(32),
  SMTP_HOST: "127.0.0.1",
  SMTP_PORT: "1025",
  SMTP_SECURE: "false",
  SMTP_PRODUCTION_ENABLED: "false",
  STAYLINK_DOCUMENT_STORE: "disabled",
  STAYLINK_LOCAL_DOCUMENT_STORE_ENABLED: "false",
  STAYLINK_CLAMAV_ENABLED: "false",
  STAYLINK_DOCUMENT_SCAN_BATCH_ENABLED: "false",
  CF_DEMO_TUNNEL_ID: "25e9de51-937e-4e14-b680-c028336732f5",
  CF_DEMO_ACCESS_TEAM: "stl-fixture",
  CF_DEMO_ACCESS_AUDIENCE: "a".repeat(64),
  CF_DEMO_TUNNEL_CREDENTIALS_FILE: "/run/creds/tunnel.json",
  CF_DEMO_ORIGIN_CA_FILE: "/run/tls/ca.pem",
  CF_DEMO_ORIGIN_CERT_FILE: "/run/tls/cert.pem",
  CF_DEMO_ORIGIN_KEY_FILE: "/run/tls/key.pem",
  CF_DEMO_WEB_ROOT: "/srv/demo",
};

it("binds the entire dedicated host to the correct Access audience and verified loopback TLS", () => {
  const config = buildCloudflareDemoConfig(local);
  expect(config.tunnel).toMatchObject({
    ingress: [
      {
        hostname: "staylink-mbsp-demo.example.test",
        service: "https://127.0.0.1:5443",
        originRequest: {
          noTLSVerify: false,
          originServerName: "localhost",
          caPool: local.CF_DEMO_ORIGIN_CA_FILE,
          access: {
            required: true,
            teamName: local.CF_DEMO_ACCESS_TEAM,
            audTag: [local.CF_DEMO_ACCESS_AUDIENCE],
          },
        },
      },
      { service: "http_status:404" },
    ],
  });
  expect(config.nginx).toContain("listen 127.0.0.1:5443 ssl;");
  expect(config.nginx).toContain(
    'proxy_set_header Cf-Access-Jwt-Assertion "";',
  );
  expect(config.nginx).toContain("no-store");
  expect(JSON.stringify(config)).not.toContain(local.DATABASE_URL);
  expect(JSON.stringify(config)).not.toContain(local.MFA_ENCRYPTION_KEY);
});

it.each([
  [{ APP_ORIGIN: "https://other.example.test" }, "APP_ORIGIN"],
  [
    { APP_ORIGIN: "https://staylink-mbsp-demo.example.test:5443" },
    "APP_ORIGIN",
  ],
  [{ CF_DEMO_ACCESS_AUDIENCE: "" }, "CF_DEMO_ACCESS_AUDIENCE"],
  [{ CF_DEMO_TUNNEL_ID: "" }, "CF_DEMO_TUNNEL_ID"],
  [{ CF_DEMO_ACCESS_TEAM: "other.example.test" }, "CF_DEMO_ACCESS_TEAM"],
  [
    { CF_DEMO_ORIGIN_CERT_FILE: "/private/assets/../tls.pem" },
    "CF_DEMO_ORIGIN_CERT_FILE",
  ],
  [{ CF_DEMO_WEB_ROOT: "/srv/demo;invalid" }, "CF_DEMO_WEB_ROOT"],
  [{ SMTP_PRODUCTION_ENABLED: "true" }, "SMTP produksi"],
  [{ STAYLINK_DOCUMENT_STORE: "local" }, "storan"],
  [{ NODE_ENV: "production" }, "NODE_ENV"],
  [
    { TEST_DATABASE_URL: "postgresql://test:test@127.0.0.1:5432/another_test" },
    "PostgreSQL",
  ],
])("fails closed for invalid inputs %o", (override, reason) => {
  expect(() => buildCloudflareDemoConfig({ ...local, ...override })).toThrow(
    reason,
  );
});
