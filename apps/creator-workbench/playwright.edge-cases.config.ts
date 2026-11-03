import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests", testMatch: "question-unmount-scale.spec.ts", workers: 1,
  timeout: 120_000, outputDir: "test-results/edge-cases",
  use: { browserName: "chromium", actionTimeout: 15_000, viewport: { width: 1440, height: 1000 }, screenshot: "only-on-failure" },
});
