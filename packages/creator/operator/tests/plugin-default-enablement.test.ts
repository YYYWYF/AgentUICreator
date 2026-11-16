import { mkdtemp, mkdir, readFile, rename, rm, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { afterEach, expect, it } from "vitest";
import { initializeAgentUIProject } from "../src/bootstrap/initialize-agent-ui-project";
import { createAgentUIInitializationHost } from "../src/project/bootstrap-host";
import { collectAppUIPluginLocations, parseAppUIModelJson } from "../src/framework/contracts/app-ui-model";
import { addAgentUIPlugin, getAgentUIPluginPlacementGuide } from "../src/project/plugin-commands";
import { completePluginEnablement, preparePluginEnablement } from "../src/project/plugin-enablement";
import { resourcePaths } from "../src/project/optional-resource-paths";
import { repositoryRoot } from "./support/generated-project";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});
async function project(mode: "platform" | "assistant" | "embedded") {
  const root = await mkdtemp(path.join(tmpdir(), "plugin default 中文 空间-"));
  roots.push(root);
  const host = path.join(repositoryRoot, "examples/creator-host-sandbox");
  await writeFile(path.join(root, "package.json"), await readFile(path.join(host, "package.json")));
  await symlink(path.join(host, "node_modules"), path.join(root, "node_modules"), process.platform === "win32" ? "junction" : "dir");
  await initializeAgentUIProject({ projectRoot: root, mode, sourceRoot: "界面 src" }, createAgentUIInitializationHost());
  const { paths } = await resourcePaths(root);
  return { root, paths, readModel: async () => parseAppUIModelJson(await readFile(paths.appUIModelPath, "utf8")) };
}

it.each(["platform", "assistant", "embedded"] as const)("%s adds slash to the declared composer Slot and headless/message Plugins to application scope", async mode => {
  const f = await project(mode);
  const before = await f.readModel();
  for (const pluginId of ["conversation-command-source", "web-search", "chart-message", "slash-command-trigger"]) {
    await completePluginEnablement(f.root, await preparePluginEnablement(f.root, pluginId));
    const result = await addAgentUIPlugin(f.root, pluginId);
    expect(result.changed).toBe(true);
    expect(result.activeComposition.resolvedPluginIds).toContain(pluginId);
    expect(result.changedPaths).toContain("界面 src/app-ui.json");
    expect(result.changedPaths.every(file => !file.includes("\\"))).toBe(true);
    await expect(addAgentUIPlugin(f.root, pluginId)).rejects.toThrow("PLUGIN_COMMAND_STALE");
  }
  const model = await f.readModel();
  const locations = collectAppUIPluginLocations(model);
  const composer = locations.find(({ plugin }) => plugin.pluginId === "composer")!.plugin;
  const slash = locations.find(({ plugin }) => plugin.pluginId === "slash-command-trigger")!;
  expect(slash.target).toEqual({ type: "plugin_slot", parentInstanceId: composer.id, slot: "triggers" });
  expect(slash.plugin.enabled).toBe(true);
  for (const id of ["conversation-command-source", "web-search", "chart-message"]) {
    expect(locations.find(({ plugin }) => plugin.pluginId === id)?.target).toEqual({ type: "application" });
  }
  delete composer.slots!.triggers;
  expect(model.root).toEqual(before.root);
  expect(await readFile(path.join(f.paths.pluginsRoot, "chart-message/definition.ts"), "utf8")).toContain("dataMessageUIs");
  expect(await readFile(path.join(f.paths.pluginsRoot, "web-search/definition.ts"), "utf8")).toContain("toolkit");
});

it("rejects ambiguous default placement without changing model or registry", async () => {
  const f = await project("platform");
  await completePluginEnablement(f.root, await preparePluginEnablement(f.root, "slash-command-trigger"));
  const model = await f.readModel();
  const composer = collectAppUIPluginLocations(model).find(({ plugin }) => plugin.pluginId === "composer")!.plugin;
  // Two enabled parents are a real ambiguity, not a reason to ask a model to choose.
  model.applicationPlugins ??= [];
  model.applicationPlugins.push({ id: "other-composer", pluginId: composer.pluginId, enabled: true });
  const source = JSON.stringify(model);
  await writeFile(f.paths.appUIModelPath, source);
  const registry = await readFile(f.paths.generatedPluginRegistryPath, "utf8");
  await expect(addAgentUIPlugin(f.root, "slash-command-trigger")).rejects.toMatchObject({ code: "AUTHORING_DEFAULT_PLACEMENT_AMBIGUOUS" });
  expect(await readFile(f.paths.appUIModelPath, "utf8")).toBe(source);
  expect(await readFile(f.paths.generatedPluginRegistryPath, "utf8")).toBe(registry);
  await expect(addAgentUIPlugin(f.root, "not-an-official-plugin")).rejects.toThrow("PLUGIN_UNAVAILABLE");
});

it("provides a read-only example from the installed Slot contract and resolves flat and nested model paths", async () => {
  const f = await project("platform");
  await completePluginEnablement(f.root, await preparePluginEnablement(f.root, "tool-fallback"));
  const before = await readFile(f.paths.appUIModelPath, "utf8");
  const guide = await getAgentUIPluginPlacementGuide(f.root, "tool-fallback");
  expect(guide).toMatchObject({ modelPath: "界面 src/app-ui.json", pluginId: "tool-fallback",
    target: { parentPluginId: "conversation-surface", slot: "toolFallback", cardinality: "one" } });
  const example: unknown = JSON.parse(guide.example);
  expect(example).toEqual({ pluginId: "conversation-surface", slots: { toolFallback: [
    { id: "tool-fallback-main", pluginId: "tool-fallback", enabled: true },
  ] } });
  expect(await readFile(f.paths.appUIModelPath, "utf8")).toBe(before);
  await mkdir(path.join(f.paths.sourceRoot, "app-ui"));
  const nested = path.join(f.paths.sourceRoot, "app-ui", "app-ui.json");
  await rename(f.paths.appUIModelPath, nested);
  const legacy = await getAgentUIPluginPlacementGuide(f.root, "tool-fallback");
  expect(legacy.modelPath).toBe("界面 src/app-ui/app-ui.json");
  expect(legacy.example).toBe(guide.example);
  expect(await readFile(nested, "utf8")).toBe(before);
});
