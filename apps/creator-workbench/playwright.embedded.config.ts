import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: "embedded-style-isolation.spec.ts",
  timeout: 120_000,
  use: {
    baseURL: "http://127.0.0.1:5178",
    browserName: "chromium",
    ...(process.env.AGENT_UI_TEST_CHROME_PATH === undefined ? {} : {
      launchOptions: { executablePath: process.env.AGENT_UI_TEST_CHROME_PATH },
    }),
  },
  webServer: {
    command: "pnpm --filter @agent-ui/creator-embedded-host dev",
    url: "http://127.0.0.1:5178/style-isolation.html",
    reuseExistingServer: false,
    timeout: 240_000,
  },
  workers: 1,
});
