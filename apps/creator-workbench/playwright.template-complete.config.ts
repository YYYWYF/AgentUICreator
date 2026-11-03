import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests", testMatch: ["template-complete-host.spec.ts", "template-integration-host.spec.ts"], fullyParallel: true, workers: 3, timeout: 90_000,
  outputDir: "../../artifacts/template-complete-20261101/browser-results",
  projects: [{ name: "chromium", use: { browserName: "chromium" } }, { name: "firefox", grepInvert: /clipboard permission denial/, use: { browserName: "firefox" } }, { name: "webkit", grepInvert: /clipboard permission denial/, use: { browserName: "webkit" } }],
  use: { viewport: { width: 1440, height: 1000 }, actionTimeout: 10_000, screenshot: "only-on-failure", trace: "retain-on-failure" },
});
