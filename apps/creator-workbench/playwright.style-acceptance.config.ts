import { defineConfig } from '@playwright/test';
export default defineConfig({testDir:'./tests',testMatch:'style-boundary-acceptance.spec.ts',workers:2,fullyParallel:true,timeout:60000,reporter:[['list']],outputDir:'test-results/style-acceptance-current',use:{browserName:'chromium',screenshot:'only-on-failure'}});
