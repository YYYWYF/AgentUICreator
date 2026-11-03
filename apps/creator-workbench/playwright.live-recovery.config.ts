import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests", testMatch: "creator-live-recovery.spec.ts", workers: 1,
  timeout: 900_000, outputDir: "test-results/live-recovery",
  use: { browserName: "chromium", actionTimeout: 15_000, viewport: { width: 1440, height: 1000 }, screenshot: "only-on-failure" },
});
