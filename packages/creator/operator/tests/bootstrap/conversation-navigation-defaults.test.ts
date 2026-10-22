import { expect, it } from "vitest";
import { createDefaultAgentUIPresetRegistry } from "../../src/bootstrap/default-presets";
import { parseAppUIModel, collectAppUIPluginLocations } from "../../src/framework/contracts/app-ui-model";
import { compileAppUIModel } from "../../src/framework/contracts/app-ui-compiler";
import { officialPackagePlugins } from "../../src/source-catalog/index";
import { parseUIPluginManifest } from "../../src/framework/contracts/ui-plugin";
import { projectWorkspaceTopology } from "../../src/project/workspace-topology";
import { agentUIModeRegistry } from "../../src/bootstrap/project-definition";

const catalog = Object.fromEntries(officialPackagePlugins.map(plugin => {
  const manifest = parseUIPluginManifest(plugin.manifest);
  return [plugin.pluginId, {
    ...(manifest.sidebar && { sidebar: manifest.sidebar }),
    ...(manifest.capabilities && { capabilities: manifest.capabilities }),
    ...(manifest.slots?.children && { childSlots: manifest.slots.children }),
    ...(manifest.requiresRenderScope !== undefined && { requiresRenderScope: manifest.requiresRenderScope }),
    ...(manifest.data?.messageUI !== undefined && { dataMessageUI: manifest.data.messageUI }),
    provides: plugin.services.provides,
    inject: plugin.services.inject,
  }];
}));
const presets = createDefaultAgentUIPresetRegistry(parseAppUIModel);
it.each(["assistant", "embedded", "platform"])("%s declares independent new-conversation and list instances", mode => {
  const model = presets.get(`${mode}/default`).createAppUIModel();
  const locations = collectAppUIPluginLocations(model);
  expect(locations.some(({ plugin }) => plugin.pluginId === "conversation-history")).toBe(false);
  expect(locations.filter(({ plugin }) => plugin.pluginId === "conversation-new")).toHaveLength(1);
  expect(locations.filter(({ plugin }) => plugin.pluginId === "conversation-thread-list")).toHaveLength(1);
  expect(locations.find(({ plugin }) => plugin.pluginId === "conversation-new")?.plugin.enabled).toBe(true);
  expect(() => compileAppUIModel(model, catalog)).not.toThrow();
  if (mode === "platform") expect(Object.keys(projectWorkspaceTopology(model, agentUIModeRegistry.get(mode).workspace).regions)).toEqual(["center"]);
});
