import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests", testMatch: "agent-connection-host.spec.ts", timeout: 120_000,
  workers: 1, use: { browserName: "chromium" },
});
