import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests", testMatch: "sidebar.spec.ts", workers: 1,
  timeout: 60_000, use: { browserName: "chromium", viewport: { width: 1200, height: 800 } },
});
