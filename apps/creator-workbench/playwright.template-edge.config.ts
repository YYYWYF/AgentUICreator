import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests", testMatch: "template-edge-host.spec.ts", workers: 1,
  timeout: 90_000, outputDir: "test-results/template-edge",
  use: { browserName: "chromium", viewport: { width: 1440, height: 1000 }, actionTimeout: 10_000, screenshot: "only-on-failure", trace: "retain-on-failure" },
});
