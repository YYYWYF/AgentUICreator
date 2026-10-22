import { parseUIPluginManifest } from "../../src/framework/contracts/ui-plugin";
import { expect, it } from "vitest";
import { officialPackagePlugins, loadAgentUISourceRegistry, resolveOfficialResource } from "../../src/source-catalog/index.js";

it("exposes one product identity per official plugin in npm and source delivery", async () => {
  const registry = await loadAgentUISourceRegistry();
  const ids = officialPackagePlugins.map(plugin => plugin.pluginId);
  expect(ids).toHaveLength(44);
  expect(new Set(ids).size).toBe(ids.length);
  expect(ids.every(id => !id.startsWith("assistant-ui-") && id !== "message-footer")).toBe(true);
  const sourceIds = registry.items.filter(item => item.id.startsWith("plugin/")).map(item => item.id.slice(7));
  expect(sourceIds.sort()).toEqual([...ids].sort());
  for (const id of ids) {
    const item = registry.byId.get(`plugin/${id}`)!;
    const manifest = JSON.parse(item.loadedFiles.find(file => file.target === `plugins/${id}/manifest.json`)!.content.toString());
    expect(manifest.id).toBe(id);
  }
  expect(resolveOfficialResource("composer").implementation).toMatchObject({ pluginId: "composer" });
  const surface = parseUIPluginManifest(officialPackagePlugins.find(plugin => plugin.pluginId === "conversation-surface")!.manifest);
  expect(surface.slots?.children).toHaveProperty("assistantResponseFooter");
  expect(surface.slots?.children).not.toHaveProperty("assistantMessageFooter");
});
