import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { minVersion } from "semver";
import { afterEach, expect, it } from "vitest";
import { initializeAgentUIProject, createDefaultAgentUIPresetRegistry } from "@agent-ui/bootstrap";
import { loadAgentUISourceRegistry, resolveAgentUISourceItemClosure } from "@agent-ui/source-registry";
import { createAgentUIInitializationHost } from "../../src/project/bootstrap-host";
import { installOfficialAgentUIResource } from "../../src/project/install-official-agent-ui-resource";
import { inspectScenarioResources } from "../../src/project/install-scenario-resources";
import { verifyUIProject } from "../../src/verify-ui";
import { collectAppUIPluginLocations, parseAppUIModel, parseAppUIModelJson } from "../../src/framework/contracts/app-ui-model";
const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
async function project(mode: "platform" | "assistant" | "embedded") {
  const root = await mkdtemp(path.join(tmpdir(), "composer-trigger-resource-")); roots.push(root);
  const registry = await loadAgentUISourceRegistry();
  const preset = createDefaultAgentUIPresetRegistry(parseAppUIModel).list().find(item => item.mode === mode)!;
  const items = [...preset.sourceItems!, "demo/composer-triggers"].flatMap(id => resolveAgentUISourceItemClosure(registry, id));
  const dependencies = Object.assign({}, ...items.map(item => item.packages ?? {})) as Record<string, string>;
  await writeFile(path.join(root, "package.json"), JSON.stringify({ dependencies }));
  for (const [name, required] of Object.entries(dependencies)) {
    const directory = path.join(root, "node_modules", name); await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, "package.json"), JSON.stringify({ name, version: minVersion(required)!.version }));
  }
  await writeFile(path.join(root, "tsconfig.json"), JSON.stringify({ compilerOptions: { target: "ES2022", module: "ESNext", moduleResolution: "Bundler", jsx: "react-jsx", resolveJsonModule: true }, include: ["custom-ui"] }));
  await initializeAgentUIProject({ projectRoot: root, mode, sourceRoot: "custom-ui" }, createAgentUIInitializationHost());
  return root;
}
it.each(["platform", "assistant", "embedded"] as const)("installs independent triggers and explicit Demo in %s under the configured source root", async mode => {
  const root = await project(mode);
  const modelPath = path.join(root, "custom-ui/app-ui/app-ui.json");
  const modelBefore = await readFile(modelPath, "utf8");
  for (const resource of ["conversation-command-source", "conversation-mention", "conversation-slash-commands", "conversation-lexical-input"]) {
    await installOfficialAgentUIResource(root, resource);
  }
  expect(await readFile(modelPath, "utf8")).toBe(modelBefore);
  await installOfficialAgentUIResource(root, "composer-trigger-demo");
  const installed = await readFile(modelPath, "utf8");
  await installOfficialAgentUIResource(root, "composer-trigger-demo");
  expect(await readFile(modelPath, "utf8")).toBe(installed);
  const locations = collectAppUIPluginLocations(parseAppUIModelJson(installed));
  const composer = locations.find(entry => entry.plugin.pluginId === "assistant-ui-composer")!;
  for (const pluginId of ["assistant-ui-mention-trigger", "assistant-ui-slash-command-trigger"]) {
    expect(locations.filter(entry => entry.plugin.pluginId === pluginId)).toHaveLength(1);
    expect(locations.find(entry => entry.plugin.pluginId === pluginId)!.target).toEqual({ type: "plugin_slot", parentInstanceId: composer.plugin.id, slot: "triggers" });
  }
  expect(locations.find(entry => entry.plugin.pluginId === "assistant-ui-lexical-composer-input")!.target).toEqual({ type: "plugin_slot", parentInstanceId: composer.plugin.id, slot: "input" });
  expect(locations.find(entry => entry.plugin.pluginId === "composer-trigger-demo")!.target).toEqual({ type: "application" });
  expect((await verifyUIProject(root)).status).toBe("passed");
  expect((await inspectScenarioResources(root)).items.find(item => item.id === "demo/composer-triggers")!.status).toBe("managed");
  await expect(readFile(path.join(root, "plugins/composer-trigger-demo/index.tsx"))).rejects.toMatchObject({ code: "ENOENT" });
});
