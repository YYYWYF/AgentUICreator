import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests', testMatch: 'workbench-panel-host.spec.ts', timeout: 180_000,
  workers: 1, use: { browserName: 'chromium', headless: true },
});
