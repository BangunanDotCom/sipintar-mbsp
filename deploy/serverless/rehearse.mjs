// Local D1 only. No calls to deployment or provisioning commands.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));
const folder = await mkdtemp(join(tmpdir(), "staylink-d1-lab-"));
try {
  for (const args of [
    ["d1", "migrations", "apply", "DB", "--local", "--persist-to", folder],
    ["d1", "execute", "DB", "--local", "--persist-to", folder, "--file", "seed-lab.sql"],
    ["d1", "execute", "DB", "--local", "--persist-to", folder, "--command", "SELECT (SELECT count(*) FROM stl_lab_accounts) AS accounts, (SELECT count(*) FROM stl_lab_drafts) AS scenarios"],
  ]) {
    const result = spawnSync(process.execPath, [join(root, "node_modules/wrangler/bin/wrangler.js"), ...args], {
      cwd: root, stdio: "inherit", env: { ...process.env, WRANGLER_SEND_METRICS: "false" },
    });
    if (result.status !== 0) throw Error("Latihan Wrangler D1 setempat gagal.");
  }
} finally {
  await rm(folder, { recursive: true, force: true });
}
