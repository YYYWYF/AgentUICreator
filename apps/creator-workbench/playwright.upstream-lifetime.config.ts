import { defineConfig } from "@playwright/test";
import base from "./playwright.soak-keyboard.config.js";
export default defineConfig({
  ...base,
  testMatch: ["upstream-tool-lifetime-host.spec.ts", "soak-runtime-host.spec.ts", "keyboard-input-host.spec.ts", "question-unmount-scale.spec.ts", "failure-recovery-host.spec.ts", "lifecycle-races-host.spec.ts"],
  outputDir: "test-results/upstream-lifetime",
});
