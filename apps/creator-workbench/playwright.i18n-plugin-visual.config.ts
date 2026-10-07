import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests", testMatch: "i18n-plugin-visual.spec.ts", timeout: 60_000, workers: 1,
  forbidOnly: !!process.env.CI, fullyParallel: false, retries: 0,
  outputDir: "test-results/i18n-plugin-visual",
  reporter: [["list"], ["json", { outputFile: "test-results/i18n-plugin-visual/results.json" }], ["html", { outputFolder: "playwright-report/i18n-plugin-visual", open: "never" }]],
  use: { browserName: "chromium", trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: ["zh-CN", "en-US"].flatMap(locale => [
    { name: `${locale}-desktop`, metadata: { locale }, use: { viewport: { width: 1440, height: 900 } } },
    { name: `${locale}-narrow`, metadata: { locale }, use: { viewport: { width: 390, height: 844 } } },
  ]),
});
