import { defineConfig } from "@playwright/test";
export default defineConfig({
  outputDir: "test-results/web-component",
  testDir: "./tests", testMatch: "web-component.spec.ts", timeout: 60_000, workers: 1,
  use: { baseURL: "http://127.0.0.1:5182", browserName: "chromium", screenshot: "only-on-failure" },
  webServer: { command: "pnpm --filter @agent-ui/web-component-vue3-demo exec vite --host 127.0.0.1 --port 5182 --strictPort", url: "http://127.0.0.1:5182", reuseExistingServer: false },
});
