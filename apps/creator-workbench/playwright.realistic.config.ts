import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests", testMatch: "realistic-host.spec.ts", outputDir: "test-results/realistic",
  workers: 1, timeout: 90_000,
  use: { browserName: "chromium", actionTimeout: 15_000, navigationTimeout: 30_000, viewport: { width: 1440, height: 1000 }, screenshot: "only-on-failure" },
});
