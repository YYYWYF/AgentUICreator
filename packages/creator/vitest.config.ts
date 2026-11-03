import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // The internal project-control module has its own resource-view setup.
    exclude: [...configDefaults.exclude, "operator/**"],
    // These are Node tooling artifacts even when the importing UI test uses
    // jsdom. Preserve native import.meta.url for presets and installed assets.
    server: { deps: { external: [/[/\\]dist[/\\]operator[/\\]/] } },
  },
});
