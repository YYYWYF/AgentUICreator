import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { installDemoPlugin } from "../../src/project/install-demo-plugin";

vi.mock("../../src/project/project-mode", () => ({ readAgentUIProjectConfig: vi.fn(async () => ({ config: {} })) }));
vi.mock("../../src/project/agent-ui-project-paths", () => ({
  resolveAgentUIProjectPaths: (root: string) => ({ appUIModelPath: path.join(root, "model.json") }),
  operatorConfigForPaths: () => ({}),
}));
vi.mock("../../src/project/source-registry/index", () => ({
  inspectAgentUISources: vi.fn(async () => ({ stateHash: "hash", items: [
    { id: "plugin/tool-timeline", status: "missing" },
    { id: "plugin/thinking-indicator", status: "missing" },
    { id: "plugin/reasoning", status: "missing" },
    { id: "plugin/tool-fallback", status: "customized" },
    { id: "plugin/conversation-quote", status: "missing" },
  ] })),
}));
vi.mock("../../src/project/source-registry/project-mutation", () => ({
  applyAgentUISourceProjectMutation: vi.fn(),
  recoverPendingAgentUISourceProjectMutation: vi.fn(),
}));
vi.mock("../../src/project/plugin-assets", () => ({
  collectPluginAssets: vi.fn(async () => ({ errors: [], assets: [
    { pluginId: "tool-timeline", authoring: { defaultPlacement: { type: "plugin_slot", parentPluginId: "conversation-surface", slot: "toolTimeline" } } },
    { pluginId: "thinking-indicator", authoring: { defaultPlacement: { type: "plugin_slot", parentPluginId: "conversation-surface", slot: "thinkingIndicator" } } },
    { pluginId: "reasoning", authoring: { defaultPlacement: { type: "plugin_slot", parentPluginId: "conversation-surface", slot: "reasoningGroup" } } },
    { pluginId: "tool-fallback", authoring: { defaultPlacement: { type: "plugin_slot", parentPluginId: "conversation-surface", slot: "toolFallback" } } },
    { pluginId: "conversation-quote", authoring: { defaultPlacement: { type: "plugin_slot", parentPluginId: "composer", slot: "beforeInput" } } },
  ] })),
}));
vi.mock("../../src/project/app-ui-transaction", () => ({ mutateAppUIModel: vi.fn() }));
import { mutateAppUIModel } from "../../src/project/app-ui-transaction";
import { applyAgentUISourceProjectMutation } from "../../src/project/source-registry/project-mutation";

const roots: string[] = [];
afterEach(async () => { vi.clearAllMocks(); await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
async function project(plugins: unknown[]) {
  const root = await mkdtemp(path.join(tmpdir(), "demo-install-")); roots.push(root);
  await writeFile(path.join(root, "model.json"), JSON.stringify({ root: { type: "slot", plugins } }));
  return root;
}
it("installs missing reasoning source and uses its semantic default placement under an enabled surface", async () => {
  const root = await project([{ id: "surface", pluginId: "conversation-surface", enabled: false }]);
  await installDemoPlugin(root, "reasoning");
  expect(applyAgentUISourceProjectMutation).toHaveBeenCalledWith(root, { itemId: "plugin/reasoning", expectedStateHash: "hash" }, { config: {} });
  expect(mutateAppUIModel).toHaveBeenCalledWith(root, expect.objectContaining({ operations: [
    { type: "set_plugin_enabled", instanceId: "surface", enabled: true },
    { type: "insert_plugin_default", plugin: { id: "reasoning-main", pluginId: "reasoning", enabled: true } },
  ] }));
});
it("preserves customized tool source while moving and enabling its existing instance in toolFallback", async () => {
  const root = await project([
    { id: "surface", pluginId: "conversation-surface", enabled: true },
    { id: "existing-tool", pluginId: "tool-fallback", enabled: false },
  ]);
  await installDemoPlugin(root, "tool-fallback");
  expect(applyAgentUISourceProjectMutation).not.toHaveBeenCalled();
  expect(mutateAppUIModel).toHaveBeenCalledWith(root, expect.objectContaining({ operations: [
    { type: "move_plugin_to", instanceId: "existing-tool", placement: { type: "plugin_slot", parentInstanceId: "surface", slot: "toolFallback" } },
    { type: "set_plugin_enabled", instanceId: "existing-tool", enabled: true },
  ] }));
});

it("inserts a missing Quote using manifest default placement", async () => {
  const root = await project([{ id: "composer-main", pluginId: "composer", enabled: true }]);
  await installDemoPlugin(root, "conversation-quote");
  expect(mutateAppUIModel).toHaveBeenCalledWith(root, expect.objectContaining({ operations: [
    { type: "insert_plugin_default", plugin: { id: "conversation-quote-main", pluginId: "conversation-quote", enabled: true } },
  ] }));
});
it("leaves an already correctly installed Quote in place", async () => {
  const root = await project([{ id: "composer-main", pluginId: "composer", enabled: true, slots: {
    beforeInput: [{ id: "quote", pluginId: "conversation-quote", enabled: true }],
  } }]);
  await installDemoPlugin(root, "conversation-quote");
  expect(mutateAppUIModel).not.toHaveBeenCalled();
});
it("repairs a misplaced Quote and enables its manifest parent", async () => {
  const root = await project([
    { id: "composer-main", pluginId: "composer", enabled: false },
    { id: "surface", pluginId: "conversation-surface", enabled: true, slots: {
      beforeInput: [{ id: "quote", pluginId: "conversation-quote", enabled: true }],
    } },
  ]);
  await installDemoPlugin(root, "conversation-quote");
  expect(mutateAppUIModel).toHaveBeenCalledWith(root, expect.objectContaining({ operations: [
    { type: "move_plugin_to", instanceId: "quote", placement: { type: "plugin_slot", parentInstanceId: "composer-main", slot: "beforeInput" } },
    { type: "set_plugin_enabled", instanceId: "composer-main", enabled: true },
  ] }));
});

it.each(["tool-timeline", "thinking-indicator"])("installs and places official message renderer %s", async id => {
  const root = await project([{ id: "surface", pluginId: "conversation-surface", enabled: true }]);
  await installDemoPlugin(root, id);
  expect(applyAgentUISourceProjectMutation).toHaveBeenCalledWith(root, { itemId: `plugin/${id}`, expectedStateHash: "hash" }, { config: {} });
  expect(mutateAppUIModel).toHaveBeenCalledWith(root, expect.objectContaining({ operations: [
    { type: "insert_plugin_default", plugin: { id: `${id}-main`, pluginId: id, enabled: true } },
  ] }));
});
