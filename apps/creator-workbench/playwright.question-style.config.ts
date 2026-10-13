import { defineConfig } from '@playwright/test';
export default defineConfig({testDir:'./tests',testMatch:'question-style-boundary.spec.ts',workers:1,timeout:60000,reporter:[['list']],outputDir:'test-results/question-style',use:{browserName:'chromium',screenshot:'only-on-failure'}});
