import { buildApp } from "../apps/api/src/app.js";
import { writeFile } from "node:fs/promises";
import { db } from "../apps/api/src/core.js";
const app = await buildApp();
await app.ready();
await writeFile(
  "docs/openapi.json",
  JSON.stringify(app.swagger(), null, 2) + "\n",
);
await app.close();
await db.$disconnect();
console.log("docs/openapi.json written");
