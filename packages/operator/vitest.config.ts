import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Operator has its own environment and resource-view setup. Browser fixtures
    // under Python are Playwright inputs, not Creator unit-test suites.
    exclude: [...configDefaults.exclude, "control/**"],
    // These are Node tooling artifacts even when the importing UI test uses
    // jsdom. Preserve native import.meta.url for presets and installed assets.
    server: { deps: { external: [/[/\\]dist[/\\]operator[/\\]/] } },
  },
});
