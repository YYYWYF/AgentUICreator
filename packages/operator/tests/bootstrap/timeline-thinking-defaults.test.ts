import { describe, expect, it } from "vitest";
import { createDefaultAgentUIPresetRegistry } from "../../src/bootstrap/default-presets.js";
const registry = createDefaultAgentUIPresetRegistry(value => value);
describe("new message presentation defaults", () => {
  it.each(["assistant", "platform"] as const)("enables both independent plugins in new %s projects", mode => {
    const preset = registry.get(`${mode}/default`);
    expect(preset.sourceItems).toContain("plugin/tool-timeline");
    expect(preset.sourceItems).toContain("plugin/thinking-indicator");
    expect(preset.sourceItems).toContain("plugin/reasoning");
  });
  it("keeps Embedded opt-in", () => {
    const preset = registry.get("embedded/default");
    expect(preset.sourceItems).not.toContain("plugin/tool-timeline");
    expect(preset.sourceItems).not.toContain("plugin/thinking-indicator");
  });
});
