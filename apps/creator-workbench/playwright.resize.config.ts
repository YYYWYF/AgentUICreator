import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests", testMatch: "resize-observer-host.spec.ts",
  outputDir: "test-results/resize", workers: 1, timeout: 120_000,
  use: { browserName: "chromium", screenshot: "only-on-failure" },
});
