import { defineConfig } from '@playwright/test';
export default defineConfig({testDir:'./tests',testMatch:'plugin-responsive-repair.spec.ts',workers:1,timeout:60000,reporter:'list',use:{browserName:'chromium',channel:'chrome',viewport:{width:420,height:1000}}});
