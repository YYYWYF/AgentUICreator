import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests", testMatch: "template-production-host.spec.ts", workers: 1,
  timeout: 180_000, outputDir: "test-results/template-production",
  use: { browserName: "chromium", viewport: { width: 1440, height: 1000 }, actionTimeout: 15_000, screenshot: "only-on-failure" },
});
