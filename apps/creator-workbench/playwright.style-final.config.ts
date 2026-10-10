import { defineConfig } from '@playwright/test';
export default defineConfig({testDir:'./tests',testMatch:'style-boundary-final.spec.ts',workers:1,timeout:60000,reporter:[['list']],outputDir:'test-results/style-final',use:{browserName:'chromium',screenshot:'only-on-failure'}});
