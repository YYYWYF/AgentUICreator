import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests', testMatch: 'stack-navigation-host.spec.ts', timeout: 180_000,
  workers: 1, use: { browserName: 'chromium', headless: true },
});
