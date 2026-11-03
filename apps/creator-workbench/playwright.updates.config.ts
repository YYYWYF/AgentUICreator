import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: "creator-updates-browser.spec.ts",
  outputDir: "test-results/updates",
  workers: 1,
  timeout: 45_000,
  use: { browserName: "chromium", viewport: { width: 1000, height: 900 }, screenshot: "only-on-failure" },
});
