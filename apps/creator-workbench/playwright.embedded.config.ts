import { defineConfig } from "@playwright/test";

export default defineConfig({
  outputDir: "test-results/embedded-style-isolation",
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
    command: "pnpm --filter @agent-ui/creator-embedded-host exec vite --host 127.0.0.1 --port 5178 --strictPort",
    url: "http://127.0.0.1:5178/style-isolation.html",
    reuseExistingServer: false,
    timeout: 240_000,
  },
  workers: 1,
});
