import "dotenv/config";
import pg from "pg";
import { readFile, readdir } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
const client = new pg.Client({
  connectionString: process.argv.includes("--test")
    ? process.env.TEST_DATABASE_URL
    : process.env.DATABASE_URL,
});
await client.connect();
try {
  await client.query("SELECT pg_advisory_lock(17345002)");
  await client.query(
    "CREATE TABLE IF NOT EXISTS _staylink_migrations (name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now(), id uuid NOT NULL)",
  );
  for (const name of (await readdir("prisma/migrations"))
    .filter((n) => /^\d/.test(n))
    .sort()) {
    const sql = await readFile(
      `prisma/migrations/${name}/migration.sql`,
      "utf8",
    );
    if (!sql.trim()) throw Error("Empty migration rejected.");
    const checksum = createHash("sha256").update(sql).digest("hex");
    const applied = await client.query(
      "SELECT checksum FROM _staylink_migrations WHERE name=$1",
      [name],
    );
    if (applied.rowCount) {
      if (applied.rows[0].checksum !== checksum)
        throw Error(`Migration changed after application: ${name}`);
      continue;
    }
    await client.query("BEGIN");
    try {
      await client.query(sql);
      await client.query(
        "INSERT INTO _staylink_migrations(name,checksum,id) VALUES ($1,$2,$3)",
        [name, checksum, randomUUID()],
      );
      await client.query("COMMIT");
      console.log(`Applied ${name}`);
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    }
  }
} finally {
  await client.query("SELECT pg_advisory_unlock(17345002)");
  await client.end();
}
