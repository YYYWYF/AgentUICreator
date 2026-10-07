import { defineConfig } from "@playwright/test";
export default defineConfig({ testDir: "./tests", testMatch: ["creator-theme-host.spec.ts", "creator-install-sync-host.spec.ts"], timeout: 120_000, workers: 1, use: { browserName: "chromium" } });
