import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests", testMatch: ["agent-connection-host.spec.ts", "ag-ui-runtime-host.spec.ts", "run-context-host.spec.ts", "shared-tooltip-host.spec.ts", "tool-result-default-host.spec.ts", "public-search-host.spec.ts", "host-thread-lifecycle.spec.ts", "conversation-management-host.spec.ts", "multi-agent-host.spec.ts"], timeout: 120_000,
  workers: 1, use: { browserName: "chromium" },
});
