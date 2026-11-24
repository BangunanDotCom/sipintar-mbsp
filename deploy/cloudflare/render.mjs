import { readFile, mkdtemp, writeFile } from "node:fs/promises";
import { join, isAbsolute } from "node:path";
import { fileURLToPath, URL } from "node:url";
import { tmpdir } from "node:os";
import {
  inspectDemoHost,
  isPersonalDemoDatabase,
} from "../../apps/api/src/demo-host-config.mjs";

const template = await readFile(
  new URL("nginx.conf.template", import.meta.url),
  "utf8",
);

export function buildCloudflareDemoConfig(env) {
  const { failures, database, origin } = inspectDemoHost(env, {
    requireKit: false,
  });
  const personal = isPersonalDemoDatabase(database);
  if (database !== "staylink_issue62_cloudflare_test" && !personal)
    failures.push("Gunakan DB PostgreSQL demo Cloudflare yang dikhaskan.");
  const host = origin ? new URL(origin).hostname : "";
  const prefix = personal ? "staylink-mbsp-personal" : "staylink-mbsp-demo";
  if (
    origin !== `https://${host}` ||
    !host.startsWith(`${prefix}.`) ||
    !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(
      host.slice(prefix.length + 1),
    )
  ) {
    failures.push(
      `APP_ORIGIN mesti HTTPS tanpa port tersuai untuk hostname ${prefix} yang diluluskan.`,
    );
  }
  if (
    !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(
      env.CF_DEMO_TUNNEL_ID ?? "",
    )
  )
    failures.push("CF_DEMO_TUNNEL_ID mesti UUID tunnel yang diluluskan.");
  if (
    !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(
      env.CF_DEMO_ACCESS_TEAM ?? "",
    )
  )
    failures.push(
      "CF_DEMO_ACCESS_TEAM mesti nama pasukan Access tanpa domain.",
    );
  if (!/^[a-f0-9]{64}$/.test(env.CF_DEMO_ACCESS_AUDIENCE ?? ""))
    failures.push(
      "CF_DEMO_ACCESS_AUDIENCE mesti AUD aplikasi Access yang diluluskan.",
    );
  for (const key of [
    "CF_DEMO_TUNNEL_CREDENTIALS_FILE",
    "CF_DEMO_ORIGIN_CA_FILE",
    "CF_DEMO_ORIGIN_CERT_FILE",
    "CF_DEMO_ORIGIN_KEY_FILE",
    "CF_DEMO_WEB_ROOT",
  ]) {
    const value = env[key] ?? "";
    if (
      !isAbsolute(value) ||
      !/^\/[a-zA-Z0-9_./-]+$/.test(value) ||
      value.split("/").some((segment) => segment === ".." || segment === ".")
    )
      failures.push(
        `${key} mesti laluan mutlak Linux tanpa traversal atau aksara konfigurasi.`,
      );
  }
  if (failures.length) throw Error(failures.join("\n"));
  return {
    nginx: template.replace(
      /@(HOST|CERT|KEY|WEB)@/g,
      (_, name) =>
        ({
          HOST: host,
          CERT: env.CF_DEMO_ORIGIN_CERT_FILE,
          KEY: env.CF_DEMO_ORIGIN_KEY_FILE,
          WEB: env.CF_DEMO_WEB_ROOT,
        })[name],
    ),
    tunnel: {
      tunnel: env.CF_DEMO_TUNNEL_ID,
      "credentials-file": env.CF_DEMO_TUNNEL_CREDENTIALS_FILE,
      metrics: "127.0.0.1:20262",
      loglevel: "warn",
      ingress: [
        {
          hostname: host,
          service: "https://127.0.0.1:5443",
          originRequest: {
            httpHostHeader: host,
            originServerName: "localhost",
            caPool: env.CF_DEMO_ORIGIN_CA_FILE,
            noTLSVerify: false,
            access: {
              required: true,
              teamName: env.CF_DEMO_ACCESS_TEAM,
              audTag: [env.CF_DEMO_ACCESS_AUDIENCE],
            },
          },
        },
        { service: "http_status:404" },
      ],
    },
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const result = buildCloudflareDemoConfig(process.env);
    const directory = await mkdtemp(join(tmpdir(), "staylink-mbsp-demo-"));
    await writeFile(join(directory, "nginx.include.conf"), result.nginx, {
      mode: 0o600,
      flag: "wx",
    });
    // JSON is valid YAML and avoids string interpolation in the tunnel configuration.
    await writeFile(
      join(directory, "cloudflared.yaml"),
      JSON.stringify(result.tunnel, null, 2) + "\n",
      { mode: 0o600, flag: "wx" },
    );
    console.log(directory);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
