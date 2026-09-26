import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { installDemoPlugin } from "../scripts/ui-project/install-demo-plugin";

vi.mock("../scripts/generate-plugin-registry", () => ({ writeGeneratedPluginRegistry: vi.fn() }));
vi.mock("../scripts/ui-project/project-mode", () => ({ readAgentUIProjectConfig: vi.fn(async () => ({ config: {} })) }));
vi.mock("../scripts/ui-project/agent-ui-project-paths", () => ({
  resolveAgentUIProjectPaths: (root: string) => ({ appUIModelPath: path.join(root, "model.json") }),
  projectControlConfigForPaths: () => ({}),
}));
vi.mock("../scripts/ui-project/source-registry", () => ({
  inspectAgentUISources: vi.fn(async () => ({ stateHash: "hash", items: [
    { id: "plugin/assistant-ui-reasoning", status: "missing" },
    { id: "plugin/assistant-ui-tool-fallback", status: "customized" },
  ] })),
  applyAgentUISourceItem: vi.fn(),
}));
vi.mock("../scripts/ui-project/app-ui-transaction", () => ({ mutateAppUIModel: vi.fn() }));
import { mutateAppUIModel } from "../scripts/ui-project/app-ui-transaction";
import { applyAgentUISourceItem } from "../scripts/ui-project/source-registry";

const roots: string[] = [];
afterEach(async () => { vi.clearAllMocks(); await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
async function project(plugins: unknown[]) {
  const root = await mkdtemp(path.join(tmpdir(), "demo-install-")); roots.push(root);
  await writeFile(path.join(root, "model.json"), JSON.stringify({ root: { type: "slot", plugins } }));
  return root;
}
it("installs missing reasoning source and uses its semantic default placement under an enabled surface", async () => {
  const root = await project([{ id: "surface", pluginId: "conversation-surface", enabled: false }]);
  await installDemoPlugin(root, "assistant-ui-reasoning");
  expect(applyAgentUISourceItem).toHaveBeenCalledWith(root, { itemId: "plugin/assistant-ui-reasoning", expectedStateHash: "hash" }, {});
  expect(mutateAppUIModel).toHaveBeenCalledWith(root, expect.objectContaining({ operations: [
    { type: "set_plugin_enabled", instanceId: "surface", enabled: true },
    { type: "insert_plugin_default", plugin: { id: "assistant-ui-reasoning-main", pluginId: "assistant-ui-reasoning", enabled: true } },
  ] }));
});
it("preserves customized tool source while moving and enabling its existing instance in toolFallback", async () => {
  const root = await project([
    { id: "surface", pluginId: "conversation-surface", enabled: true },
    { id: "existing-tool", pluginId: "assistant-ui-tool-fallback", enabled: false },
  ]);
  await installDemoPlugin(root, "assistant-ui-tool-fallback");
  expect(applyAgentUISourceItem).not.toHaveBeenCalled();
  expect(mutateAppUIModel).toHaveBeenCalledWith(root, expect.objectContaining({ operations: [
    { type: "move_plugin", instanceId: "existing-tool", target: { type: "plugin_slot", parentInstanceId: "surface", slot: "toolFallback" } },
    { type: "set_plugin_enabled", instanceId: "existing-tool", enabled: true },
  ] }));
});
