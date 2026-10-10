import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests", testMatch: "style-boundary-visual.spec.ts", workers: 1, timeout: 90_000,
  outputDir: "test-results/style-boundary", reporter: [["list"]],
  use: { browserName: "chromium", screenshot: "only-on-failure" },
});
