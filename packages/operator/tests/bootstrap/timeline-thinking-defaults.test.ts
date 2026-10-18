import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createDefaultAgentUIPresetRegistry } from "../../src/bootstrap/default-presets.js";
const registry = createDefaultAgentUIPresetRegistry(value => value);
describe("new message presentation defaults", () => {
  it.each(["assistant", "embedded", "platform"] as const)("enables both independent plugins in new %s projects", mode => {
    const preset = registry.get(`${mode}/default`);
    expect(preset.sourceItems).toContain("plugin/tool-timeline");
    expect(preset.sourceItems).toContain("plugin/thinking-indicator");
    expect(preset.sourceItems).toContain("plugin/reasoning");
  });
  it("shares the assistant template with embedded while returning independent project models", () => {
    const assistant = registry.get("assistant/default");
    const embedded = registry.get("embedded/default");
    const first = assistant.createAppUIModel();
    const second = embedded.createAppUIModel();
    expect(second).toEqual(first);
    expect(second).not.toBe(first);
    expect(embedded.sourceItems).toEqual(assistant.sourceItems);
  });
  it("resolves the shared template reference with portable file URLs", () => {
    const alias = JSON.parse(readFileSync(new URL("../../presets/embedded/app-ui.json", import.meta.url), "utf8"));
    expect(alias).toEqual({ $ref: "../assistant/app-ui.json" });
    for (const base of ["file:///C:/Agent%20UI%20%E4%B8%AD%E6%96%87/", "file:///Agent%20UI%20%E4%B8%AD%E6%96%87/"]) {
      expect(new URL(alias.$ref, `${base}presets/embedded/app-ui.json`).href).toBe(`${base}presets/assistant/app-ui.json`);
    }
  });
});
