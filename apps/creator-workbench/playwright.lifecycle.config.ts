import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests", testMatch: "lifecycle-races-host.spec.ts", workers: 1,
  timeout: 90_000, outputDir: "test-results/lifecycle",
  use: { browserName: "chromium", actionTimeout: 15_000, viewport: { width: 1440, height: 1000 }, screenshot: "only-on-failure" },
});
