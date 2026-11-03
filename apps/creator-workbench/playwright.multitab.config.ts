import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests", testMatch: "multitab-resource-cycles.spec.ts", workers: 1,
  timeout: 120_000, outputDir: "test-results/multitab",
  use: { browserName: "chromium", actionTimeout: 15_000, viewport: { width: 1440, height: 1000 }, screenshot: "only-on-failure" },
});
