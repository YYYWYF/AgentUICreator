import { expect, it } from "vitest";
import { createDefaultAgentUIPresetRegistry } from "../src/default-presets";
const registry = createDefaultAgentUIPresetRegistry(value => value);
it.each(["platform", "assistant", "embedded"])("leaves authentication opt-in for %s", mode => {
  const preset = registry.get(`${mode}/default`);
  expect(preset.sourceItems).not.toContain("plugin/auth-gate");
  expect(preset.sourceItems).not.toContain("plugin/auth-account");
  expect(JSON.stringify(preset.createAppUIModel())).not.toContain("auth-gate");
});
