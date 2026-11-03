import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests", testMatch: ["keyboard-input-host.spec.ts", "soak-runtime-host.spec.ts", "upstream-tool-lifetime-host.spec.ts"], workers: 1,
  timeout: 240_000, outputDir: "test-results/soak-keyboard",
  use: { browserName: "chromium", actionTimeout: 15_000, viewport: { width: 1440, height: 1000 }, screenshot: "only-on-failure" },
});
