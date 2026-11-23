import { inspectDemoHost } from "./demo-host-config.mjs";
import { loadSyntheticOwnerPolicy } from "./synthetic-owner-policy.js";
import { buildApp } from "./app.js";
import { db, production, origin, encrypt } from "./core.js";
if (production && !origin.startsWith("https://"))
  throw Error("Produksi memerlukan APP_ORIGIN HTTPS.");
if (process.env.STAYLINK_DEMO_HOST === "true") {
  const { failures } = inspectDemoHost();
  if (failures.length) throw Error(failures.join(" "));
  const policy = loadSyntheticOwnerPolicy();
  if (!policy?.config.review.enabled || policy.config.billing.mode !== "MOCK")
    throw Error("Polisi demo mesti menggunakan semakan sintetik dan bil MOCK.");
}
encrypt("startup-key-validation");
const app = await buildApp();
await app.listen({
  host: "127.0.0.1",
  port: Number(process.env.API_PORT || 3001),
});
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, async () => {
    await app.close();
    await db.$disconnect();
    process.exit(0);
  });
