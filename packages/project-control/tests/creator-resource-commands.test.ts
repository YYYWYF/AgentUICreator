import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { minVersion } from "semver";
import { afterEach, expect, it, vi } from "vitest";
import { initializeAgentUIProject, createDefaultAgentUIPresetRegistry } from "@agent-ui/bootstrap";
import { loadAgentUISourceRegistry, officialResourceRegistry, resolveAgentUISourceItemClosure } from "@agent-ui/source-registry";
import { createAgentUIInitializationHost } from "../src/project/bootstrap-host";
import { installOfficialAgentUIResource } from "../src/project/install-official-agent-ui-resource";
import { inspectOfficialAgentUIResourceCatalog } from "../src/project/official-resource-inspection";
import { inspectScenarioResources } from "../src/project/install-scenario-resources";
import { collectAppUIPluginLocations, parseAppUIModel, parseAppUIModelJson } from "../src/framework/contracts/app-ui-model";
import { synchronizeAgentUIPluginRegistry } from "../src/project/synchronize-plugin-registry";
import { generatePluginRegistry } from "../src/project/registry-generator";
import { resourcePaths } from "../src/project/optional-resource-paths";
const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
async function project() {
  const root = await mkdtemp(path.join(tmpdir(), "creator-resource-command-")); roots.push(root);
  const registry = await loadAgentUISourceRegistry();
  const preset = createDefaultAgentUIPresetRegistry(parseAppUIModel).list().find(item => item.mode === "platform")!;
  const items = [...preset.sourceItems!, "plugin/web-search"].flatMap(id => resolveAgentUISourceItemClosure(registry, id));
  const dependencies: Record<string, string> = {};
  for (const item of items) for (const [name, range] of Object.entries(item.packages ?? {})) dependencies[name] = dependencies[name] ? `${dependencies[name]} ${range}` : range;
  await writeFile(path.join(root, "package.json"), JSON.stringify({ dependencies }));
  for (const [name, required] of Object.entries(dependencies)) {
    const directory = path.join(root, "node_modules", name); await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, "package.json"), JSON.stringify({ name, version: minVersion(required)!.version }));
  }
  await writeFile(path.join(root, "tsconfig.json"), JSON.stringify({ compilerOptions: { target: "ES2022", module: "ESNext", moduleResolution: "Bundler", jsx: "react-jsx", resolveJsonModule: true }, include: ["custom-ui"] }));
  await initializeAgentUIProject({ projectRoot: root, mode: "platform", sourceRoot: "custom-ui" }, createAgentUIInitializationHost());
  return root;
}
const modelPath = (root: string) => path.join(root, "custom-ui/app-ui/app-ui.json");
it("catalog only exposes explicit discoverable resources and never installation internals", async () => {
  const root = await project();
  const catalog = await inspectOfficialAgentUIResourceCatalog(root);
  expect(catalog.map(item => item.id)).toEqual(officialResourceRegistry.resources.filter(item => item.discoverable).map(item => item.id));
  expect(catalog.find(item => item.id === "web-search")).toMatchObject({ status: "missing", installable: true });
  expect(catalog.some(item => item.id === "a2ui" || item.id === "conversation-mention" || item.id === "ask-user-question-demo")).toBe(false);
  expect(catalog.every(item => Object.keys(item).every(key => ["id", "label", "description", "status", "installable"].includes(key)))).toBe(true);
});
it("preserves customized source bytes when re-enabling a resource and is idempotent", async () => {
  const root = await project();
  const first = await installOfficialAgentUIResource(root, "web-search");
  expect(first.verification?.status).toBe("passed");
  const definition = path.join(root, "custom-ui/plugins/web-search/definition.ts");
  const customized = (await readFile(definition, "utf8")) + "\n// User customization must survive activation.\n";
  await writeFile(definition, customized);
  const model = parseAppUIModelJson(await readFile(modelPath(root), "utf8"));
  collectAppUIPluginLocations(model).find(item => item.plugin.pluginId === "web-search")!.plugin.enabled = false;
  await writeFile(modelPath(root), JSON.stringify(model));
  expect((await inspectScenarioResources(root)).items.find(item => item.id === "plugin/web-search")?.status).toBe("customized");
  expect((await inspectOfficialAgentUIResourceCatalog(root)).find(item => item.id === "web-search")).toMatchObject({ status: "disabled", installable: true });
  const runPackages = vi.fn(async () => {});
  expect(await installOfficialAgentUIResource(root, "web-search", { runPackages })).toMatchObject({ changed: true, reenabled: true, verification: { status: "passed" } });
  expect(await readFile(definition, "utf8")).toBe(customized);
  expect((await inspectOfficialAgentUIResourceCatalog(root)).find(item => item.id === "web-search")).toMatchObject({ status: "ready", installable: false });
  expect(await installOfficialAgentUIResource(root, "web-search", { runPackages })).toMatchObject({ changed: false });
  expect(runPackages).not.toHaveBeenCalled();
});
it("duplicate resources conflict before writes", async () => {
  const root = await project(); await installOfficialAgentUIResource(root, "web-search");
  const model = parseAppUIModelJson(await readFile(modelPath(root), "utf8"));
  model.applicationPlugins!.push({ id: "duplicate-web", pluginId: "web-search", enabled: false });
  const source = JSON.stringify(model); await writeFile(modelPath(root), source);
  const runPackages = vi.fn(async () => {});
  await expect(installOfficialAgentUIResource(root, "web-search", { runPackages })).rejects.toMatchObject({ code: "RESOURCE_CONFLICT" });
  expect(await readFile(modelPath(root), "utf8")).toBe(source); expect(runPackages).not.toHaveBeenCalled();
});
it("sync handles fresh, stale and missing registry and touches no other generated artifacts", async () => {
  const root = await project();
  const { paths, config } = await resourcePaths(root);
  const model = parseAppUIModelJson(await readFile(modelPath(root), "utf8"));
  const expected = (await generatePluginRegistry(root, model, { paths, config })).capabilityCatalog.source;
  const beforeModel = await readFile(modelPath(root), "utf8");
  expect((await synchronizeAgentUIPluginRegistry(root)).changed).toBe(false);
  await writeFile(paths.generatedPluginRegistryPath, "// stale\n");
  expect((await synchronizeAgentUIPluginRegistry(root)).changed).toBe(true);
  expect(await readFile(paths.generatedPluginRegistryPath, "utf8")).toBe(expected);
  await rm(paths.generatedPluginRegistryPath);
  expect((await synchronizeAgentUIPluginRegistry(root)).changed).toBe(true);
  expect(await readFile(paths.generatedPluginRegistryPath, "utf8")).toBe(expected);
  expect(await readFile(modelPath(root), "utf8")).toBe(beforeModel);
  await writeFile(modelPath(root), "{}"); await writeFile(paths.generatedPluginRegistryPath, "// untouched on failure\n");
  await expect(synchronizeAgentUIPluginRegistry(root)).rejects.toThrow();
  expect(await readFile(paths.generatedPluginRegistryPath, "utf8")).toBe("// untouched on failure\n");
});

it("preserves customized provided Plugin source when re-enabling Reasoning", async () => {
  const root = await project();
  const definition = path.join(root, "custom-ui/plugins/assistant-ui-reasoning/definition.ts");
  const customized = (await readFile(definition, "utf8")) + "\n// User-owned reasoning customization.\n";
  await writeFile(definition, customized);
  const model = parseAppUIModelJson(await readFile(modelPath(root), "utf8"));
  collectAppUIPluginLocations(model).find(item => item.plugin.pluginId === "assistant-ui-reasoning")!.plugin.enabled = false;
  await writeFile(modelPath(root), JSON.stringify(model));
  expect((await inspectScenarioResources(root)).items.find(item => item.id === "plugin/assistant-ui-reasoning")?.status).toBe("customized");
  expect(await installOfficialAgentUIResource(root, "reasoning")).toMatchObject({ changed: true, reenabled: true, verification: { status: "passed" } });
  expect(await readFile(definition, "utf8")).toBe(customized);
  expect((await inspectOfficialAgentUIResourceCatalog(root)).find(item => item.id === "reasoning")).toMatchObject({ status: "ready", installable: false });
});
