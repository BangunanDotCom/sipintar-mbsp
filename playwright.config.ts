import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 45000,
  use: {
    baseURL:
      process.env.STAYLINK_HTTPS_REHEARSAL === "true"
        ? process.env.APP_ORIGIN === "https://localhost:5444"
          ? "https://localhost:5444"
          : "https://localhost:5443"
        : "http://localhost:5173",
    ignoreHTTPSErrors: process.env.STAYLINK_HTTPS_REHEARSAL === "true",
    headless: true,
    launchOptions: {
      executablePath:
        process.env.CHROMIUM_PATH ??
        (process.env.CI ? undefined : "/usr/bin/chromium"),
      args: ["--no-sandbox"],
    },
    trace: process.env.STAYLINK_UAT_KIT_FILE ? "off" : "retain-on-failure",
  },
  reporter: [["list"], ["html", { open: "never" }]],
});
