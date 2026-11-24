import { randomUUID } from "node:crypto";
import { link, open, unlink } from "node:fs/promises";
import { oracleConfig } from "../../apps/api/src/oracle/config.js";
import { createOraclePool } from "../../apps/api/src/oracle/pool.js";
import { importPostgresLab } from "./import-postgres.js";
import { exportOracleSnapshot, restoreOracleSnapshot } from "./snapshot.js";

const [action, filename, extra] = process.argv.slice(2);
if (
  extra ||
  (action === "import-postgres"
    ? filename
    : !["export", "restore"].includes(action) || !filename)
)
  throw Error(
    "Penggunaan: oracle:backup export|restore fail.json atau oracle:backup import-postgres",
  );

const maxBytes = 64 * 1024 * 1024;
const pool = await createOraclePool(oracleConfig(process.env, "install"));
try {
  if (action === "import-postgres") {
    console.log(
      await importPostgresLab(pool, process.env.ORACLE_LAB_POSTGRES_URL),
    );
  } else if (action === "export") {
    const backup = await exportOracleSnapshot(pool);
    const serialized = JSON.stringify(backup);
    if (Buffer.byteLength(serialized) > maxBytes)
      throw Error("Sandaran melebihi had makmal 64 MiB.");
    const temporary = `${filename}.${randomUUID()}.tmp`;
    const file = await open(temporary, "wx", 0o600);
    try {
      try {
        await file.writeFile(serialized);
        await file.sync();
      } finally {
        await file.close();
      }
      await link(temporary, filename!);
    } finally {
      await unlink(temporary);
    }
    console.log(backup.checksum);
  } else {
    const file = await open(filename!, "r");
    try {
      const stat = await file.stat();
      if (!stat.isFile() || stat.size > maxBytes || (stat.mode & 0o077) !== 0)
        throw Error(
          "Fail sandaran mesti fail persendirian dan maksimum 64 MiB.",
        );
      const backup = JSON.parse(await file.readFile("utf8"));
      console.log(await restoreOracleSnapshot(pool, backup));
    } finally {
      await file.close();
    }
  }
} finally {
  await pool.close();
}
