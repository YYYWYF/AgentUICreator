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
    // One supervisor prepares packages once and owns both real server processes.
    command: "node ../../scripts/dev-workbench.mjs --workbench-port 5179 --host-port 5180",
    url: "http://127.0.0.1:5179",
    env: {
      CREATOR_VERIFICATION_MODE: "static_and_runtime",
      VITE_ENABLE_VISUAL_OBSERVATION: "true",
      VITE_CREATOR_HOST_PREVIEW_URL: "http://127.0.0.1:5180/?creator-preview",
    },
    reuseExistingServer: false,
    timeout: 240_000,
  },
  workers: 1,
});
