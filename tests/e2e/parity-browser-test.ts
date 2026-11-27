import { createHash } from "node:crypto";
import { test as base } from "@playwright/test";

export const test = base.extend({
  extraHTTPHeaders: async ({ extraHTTPHeaders }, use, testInfo) => {
    if (process.env.STAYLINK_TEST_PARITY_PROXY !== "true") {
      await use(extraHTTPHeaders);
      return;
    }

    const index = createHash("sha256").update(testInfo.title).digest()[0];
    await use({
      ...extraHTTPHeaders,
      "x-staylink-demo-client": `192.0.2.${32 + (index % 192)}`,
    });
  },
});
