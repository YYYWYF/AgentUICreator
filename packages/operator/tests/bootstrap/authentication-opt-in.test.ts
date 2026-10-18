import { expect, it } from "vitest";
import { createDefaultAgentUIPresetRegistry } from "../../src/bootstrap/default-presets";
import { parseAppUIModel } from "../../src/framework/contracts/app-ui-model";
const registry = createDefaultAgentUIPresetRegistry(value => value);
it.each(["platform", "assistant", "embedded"])("leaves authentication opt-in for %s", mode => {
  const preset = registry.get(`${mode}/default`);
  expect(preset.sourceItems).not.toContain("plugin/auth-gate");
  expect(preset.sourceItems).not.toContain("plugin/auth-account");
  expect(JSON.stringify(preset.createAppUIModel())).not.toContain("auth-gate");
  expect(JSON.stringify(preset.createAppUIModel())).not.toContain("auth-account");
});
it("keeps only identity and conversation actions in the assistant default header", () => {
  const presets = createDefaultAgentUIPresetRegistry(parseAppUIModel);
  const model = presets.get("assistant/default").createAppUIModel();
  expect(model.root.type).toBe("column");
  if (model.root.type !== "column") throw new Error("Expected assistant column");
  const header = model.root.children[0];
  expect(header?.type).toBe("row");
  if (header?.type !== "row") throw new Error("Expected assistant header");
  expect(header.sizes).toEqual(["minmax(0, 1fr)", "auto", "auto"]);
  expect(header.children).toHaveLength(3);
  expect(header.children.at(-1)).toMatchObject({ type: "slot", plugins: [{ pluginId: "conversation-history" }] });
  expect(model.applicationPlugins?.some(plugin => plugin.pluginId === "auth-gate")).toBe(false);
});
