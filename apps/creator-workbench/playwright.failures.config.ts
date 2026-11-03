import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests", testMatch: "failure-recovery-host.spec.ts",
  outputDir: "test-results/failures", workers: 1, timeout: 90_000,
  use: { browserName: "chromium", viewport: { width: 1440, height: 1000 }, screenshot: "only-on-failure" },
});
