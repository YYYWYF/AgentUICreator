import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests', testMatch: 'message-spacing.spec.ts', workers: 1,
  timeout: 60000, reporter: [['list']],
  use: { browserName: 'chromium', screenshot: 'only-on-failure' },
});
