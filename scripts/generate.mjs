// Prisma's supported JS driver engine requires no native query engine.
// getGenerators runs schema validation/codegen with the bundled WASM parser.
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
import internals from "@prisma/internals";
const { getGenerators } = internals;
const generators = await getGenerators({
  schemaPath: "prisma/schema.prisma",
  skipDownload: true,
  registry: {
    "prisma-client-js": {
      type: "rpc",
      generatorPath: require.resolve("@prisma/client/generator-build/index.js"),
      isNode: true,
    },
  },
});
try {
  for (const generator of generators) await generator.generate();
  console.log(
    "Prisma Client generated (JavaScript engine / PostgreSQL adapter).",
  );
} finally {
  for (const generator of generators) generator.stop();
}
