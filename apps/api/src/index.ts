import { buildApp } from "./app.js";
import { db, production, origin, encrypt } from "./core.js";
if (production && !origin.startsWith("https://"))
  throw Error("Produksi memerlukan APP_ORIGIN HTTPS.");
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
