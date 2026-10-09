import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests", testMatch: ["creator-refresh.e2e.spec.ts", "creator-refresh-dialogue.spec.ts"], timeout: 120_000, workers: 1,
  use: { baseURL: process.env.CREATOR_REFRESH_URL || "http://127.0.0.1:5174", browserName: "chromium", viewport: { width: 1440, height: 1000 } },
  webServer: process.env.CREATOR_REFRESH_URL ? undefined : { command: "pnpm --dir ../.. dev", url: "http://127.0.0.1:5174", reuseExistingServer: true, timeout: 240_000 },
});
