import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: "*.e2e.spec.ts",
  timeout: 120_000,
  use: {
    baseURL: "http://127.0.0.1:5179",
    browserName: "chromium",
  },
  webServer: {
    command: "pnpm dev --host 127.0.0.1 --port 5179 --strictPort",
    url: "http://127.0.0.1:5179",
    env: {
      CREATOR_VERIFICATION_MODE: "static_and_runtime",
      VITE_ENABLE_VISUAL_OBSERVATION: "true",
    },
    reuseExistingServer: false,
    timeout: 120_000,
  },
  workers: 1,
});
