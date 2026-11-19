import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";

it("loads Prisma 6 configuration through the CLI's config dependency", async () => {
  const require = createRequire(import.meta.url);
  const prismaRequire = createRequire(require.resolve("prisma/config"));
  const { loadConfigFromFile } = prismaRequire("@prisma/config");
  const configRoot = await mkdtemp(join(tmpdir(), "staylink-prisma-config-"));
  const configFile = join(configRoot, "prisma.config.ts");

  try {
    await writeFile(
      configFile,
      `export default {
        schema: "./prisma/schema.prisma",
        migrations: { path: "./prisma/migrations", seed: "tsx prisma/seed.ts" },
      };`,
    );

    const result = await loadConfigFromFile({ configFile, configRoot });

    expect(result.error).toBeUndefined();
    expect(result).toMatchObject({
      resolvedPath: configFile,
      config: {
        schema: join(configRoot, "prisma/schema.prisma"),
        migrations: {
          path: join(configRoot, "prisma/migrations"),
          seed: "tsx prisma/seed.ts",
        },
      },
    });
  } finally {
    await rm(configRoot, { recursive: true, force: true });
  }
});
