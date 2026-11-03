// @vitest-environment node
import { cp, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { afterEach, expect, it } from "vitest";
import { build } from "vite";
import { officialPackagePlugins, loadAgentUISourceRegistry } from "@za38.03/agent-ui-creator/source-registry";
import { resourcePaths } from "../src/project/optional-resource-paths";
import { collectPluginProjectFacts, generatePluginRegistry } from "../src/project/registry-generator";
import { buildCreatorAuthoringTargetCatalog } from "../src/project/creator-authoring-target-catalog";
import { createCustomPlugin } from "../src/project/create-custom-plugin";
import { migrateOfficialPackagePlugin } from "../src/project/migrate-official-package-plugin";
import { resolveAgentUISourceItems } from "../src/project/source-registry/installer";
import { sha256 } from "../src/project/source-registry/lock";
import { inspectAgentUISources } from "../src/project/source-registry/inspector";
import type { LoadedAgentUISourceItem } from "../src/source-catalog/index.js";
import { repositoryRoot } from "./support/generated-project";
const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), "official-package-pilot 工程 ")); roots.push(root);
  for (const directory of [".agent-ui", "src/agent-ui/app-ui", "src/agent-ui/plugins", "src/agent-ui/runtime", "node_modules/@za38.03"]) await mkdir(path.join(root, directory), { recursive: true });
  await writeFile(path.join(root, ".agent-ui/project.json"), JSON.stringify({ mode: "assistant", sourceRoot: "src/agent-ui" }));
  await writeFile(path.join(root, "package.json"), JSON.stringify({ type: "module", scripts: { build: "vite build" } }));
  for (const name of ["plugins", "core", "renderer", "runtime"]) await symlink(path.join(repositoryRoot, "packages", name), path.join(root, `node_modules/@za38.03/agent-ui-${name}`), process.platform === "win32" ? "junction" : "dir");
  await symlink(path.join(repositoryRoot, "packages/creator/node_modules/react"), path.join(root, "node_modules/react"), process.platform === "win32" ? "junction" : "dir");
  await writeFile(path.join(root, "src/agent-ui/app-ui/app-ui.json"), JSON.stringify({ root: { type: "slot", plugins: [{ id: "composer-main", pluginId: "composer", enabled: true }] } }));
  return root;
}
it("keeps reference source in Registry while installation materializes no official Composer files", async () => {
  const registry = await loadAgentUISourceRegistry();
  expect(registry.byId.get("plugin/composer")!.loadedFiles).toHaveLength(3);
  const items = resolveAgentUISourceItems(registry, ["plugin/composer"]);
  const item = items.find(item => item.id === "plugin/composer")!;
  expect(item.loadedFiles).toEqual([]);
  expect(item.packages!["@za38.03/agent-ui-plugins"]).toBe("0.0.1");
});
it("validates npm dependencies independently from partial reference source, retaining real source and missing-package guards", async () => {
  const root = await fixture(); const ctx = await resourcePaths(root);
  const registry = await loadAgentUISourceRegistry();
  const npm = { ...registry.byId.get("plugin/conversation-command-source")!, requires: [], packages: {} };
  const item = (id: string, targets: string[], requires: string[] = []): LoadedAgentUISourceItem => ({
    id, kind: "foundation", description: id, requires, itemRoot: root, manifestPath: path.join(root, "item.json"),
    files: targets.map(target => ({ source: target, target })),
    loadedFiles: targets.map(target => ({ source: target, target, absolutePath: path.join(root, target), content: Buffer.from("export {};\n") })),
  });
  const source = item("foundation/source-dependency", ["demo/a.ts", "demo/b.ts"]);
  const demo = item("foundation/consumer", ["demo/consumer.ts"], [npm.id, source.id]);
  const items = [npm, source, demo];
  for (const file of [npm.loadedFiles[0]!, source.loadedFiles[0]!, demo.loadedFiles[0]!]) {
    const target = path.join(ctx.paths.sourceRoot, file.target); await mkdir(path.dirname(target), { recursive: true }); await writeFile(target, file.content);
  }
  await writeFile(path.join(root, "package.json"), JSON.stringify({ dependencies: { "@za38.03/agent-ui-plugins": "0.0.1" } }));
  await writeFile(ctx.paths.sourceLockPath, JSON.stringify({ sourceRoot: "src/agent-ui", items: {
    [demo.id]: { files: { "demo/consumer.ts": { sha256: sha256(demo.loadedFiles[0]!.content) } } },
    [source.id]: { files: Object.fromEntries(source.loadedFiles.map(file => [file.target, { sha256: sha256(file.content) }])) },
  } }));
  const inspect = () => inspectAgentUISources(root, ctx.config, { root, items, byId: new Map(items.map(item => [item.id, item])) });
  const before = await inspect();
  expect(["partial", "blocked"]).toContain(before.items.find(item => item.id === npm.id)!.status);
  const consumer = before.items.find(item => item.id === demo.id)!;
  expect(consumer.dependencyIssues.map(issue => issue.itemId)).toEqual([source.id]);
  expect(consumer.resolvedRequirements.every(requirement => requirement.compatible)).toBe(true);
  await rm(path.join(root, "node_modules/@za38.03/agent-ui-plugins"));
  const missing = (await inspect()).items.find(item => item.id === demo.id)!;
  expect(missing.resolvedRequirements).toContainEqual(expect.objectContaining({ name: "@za38.03/agent-ui-plugins", compatible: false }));
});
it("only selected package entries enter runtime registry; discovery and reference targets remain available", async () => {
  const root = await fixture(); const ctx = await resourcePaths(root);
  const model = JSON.parse(await readFile(ctx.paths.appUIModelPath, "utf8"));
  const facts = await collectPluginProjectFacts(root, ctx.config, ctx.paths);
  const result = await generatePluginRegistry(root, model, ctx);
  expect(result.errors).toEqual([]);
  expect(result.capabilityCatalog.pluginIds).toEqual(["composer"]);
  expect(result.capabilityCatalog.source).toContain('import("@za38.03/agent-ui-plugins/composer")');
  expect(result.capabilityCatalog.source).not.toMatch(/feedback|reasoning|chart/);
  const catalog = await buildCreatorAuthoringTargetCatalog({ projectRoot: root, ...ctx, projectFacts: facts, applicationTargets: [] });
  expect(catalog.candidates.find(target => target.relatedPluginIds?.includes("composer"))?.kind).toBe("official_plugin_reference");
  expect(catalog.bindings.every(binding => !binding.ownerRoot)).toBe(true);
});
it("rejects reserved IDs through Host creation and inventory", async () => {
  const root = await fixture();
  await expect(createCustomPlugin(root, { pluginId: "composer" })).rejects.toMatchObject({ code: "PLUGIN_ID_RESERVED_BY_OFFICIAL" });
  const ctx = await resourcePaths(root); const official = officialPackagePlugins[0]!;
  await mkdir(path.join(ctx.paths.pluginsRoot, official.pluginId));
  await writeFile(path.join(ctx.paths.pluginsRoot, official.pluginId, "manifest.json"), JSON.stringify(official.manifest));
  expect((await collectPluginProjectFacts(root, ctx.config, ctx.paths)).inventoryIssues).toContainEqual(expect.objectContaining({ code: "PLUGIN_ID_RESERVED_BY_OFFICIAL" }));
});
it("creates a project-owned custom Composer, preserves instance Slots and actually builds selected registry", async () => {
  const root = await fixture();
  const result = await createCustomPlugin(root, { pluginId: "company-composer", basedOn: "composer", replaceInstanceId: "composer-main" }, async staged => {
    await build({ root: staged, configFile: false, logLevel: "silent", build: { write: false,
      lib: { entry: path.join(staged, "src/agent-ui/plugins/registry.generated.ts"), formats: ["es"] },
    } });
  });
  expect(result.ownership).toBe("project_source"); expect(result.checks).toEqual(["build"]);
  expect(result.changedPaths).toContain("src/agent-ui/app-ui/app-ui.json");
  expect(result.changedPaths).toContain("src/agent-ui/plugins/registry.generated.ts");
  expect(result.changedPaths.every(file => !file.includes("\\"))).toBe(true);
  const ctx = await resourcePaths(root); const model = JSON.parse(await readFile(ctx.paths.appUIModelPath, "utf8"));
  expect(model.root.plugins[0]).toMatchObject({ id: "composer-main", pluginId: "company-composer" });
  const source = await readFile(path.join(ctx.paths.pluginsRoot, "company-composer/index.tsx"), "utf8");
  expect(source).toContain("ConversationCanonicalComposer"); expect(source).not.toContain("ConversationComposerPlugin");
  const catalog = await buildCreatorAuthoringTargetCatalog({ projectRoot: root, ...ctx, projectFacts: await collectPluginProjectFacts(root, ctx.config, ctx.paths), applicationTargets: [] });
  expect(catalog.candidates.find(target => target.relatedPluginIds?.includes("company-composer"))?.kind).toBe("plugin_source");
  expect(catalog.bindings.find(target => target.pluginId === "company-composer")).toMatchObject({ ownerPath: "src/agent-ui/plugins/company-composer/definition.ts" });
  expect(await readFile(ctx.paths.generatedPluginRegistryPath, "utf8")).not.toContain('@za38.03/agent-ui-plugins/composer');
});
it("failed build leaves source and AppUIModel unchanged", async () => {
  const root = await fixture(); const ctx = await resourcePaths(root); const before = await readFile(ctx.paths.appUIModelPath, "utf8");
  await expect(createCustomPlugin(root, { pluginId: "company-composer", basedOn: "composer", replaceInstanceId: "composer-main" }, async () => { throw new Error("build failed"); })).rejects.toThrow("build failed");
  expect(await readFile(ctx.paths.appUIModelPath, "utf8")).toBe(before);
  expect(await readdir(ctx.paths.pluginsRoot)).toEqual([]);
});
async function legacy(root: string, modified: boolean) {
  const ctx = await resourcePaths(root); const registry = await loadAgentUISourceRegistry(); const item = registry.byId.get("plugin/composer")!;
  const files: Record<string, { sha256: string }> = {};
  for (const file of item.loadedFiles) {
    const destination = path.join(ctx.paths.sourceRoot, file.target); await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, file.content); files[file.target] = { sha256: sha256(file.content) };
  }
  await writeFile(ctx.paths.sourceLockPath, JSON.stringify({ sourceRoot: ctx.config.agentUI.sourceRoot, items: { [item.id]: { files } } }));
  if (modified) await writeFile(path.join(ctx.paths.pluginsRoot, "composer/index.tsx"), "// custom business code\n");
  return ctx;
}
it("migrates unchanged baseline without changing AppUI ID", async () => {
  const root = await fixture(); const ctx = await legacy(root, false);
  expect(await migrateOfficialPackagePlugin(root)).toEqual({ changed: true });
  expect(await readdir(ctx.paths.pluginsRoot)).not.toContain("composer");
  expect(await readFile(ctx.paths.generatedPluginRegistryPath, "utf8")).toContain('@za38.03/agent-ui-plugins/composer');
  expect(JSON.parse(await readFile(ctx.paths.sourceLockPath, "utf8")).items).toEqual({});
});
it("preserves modified legacy source and reports exact migration diagnostic", async () => {
  const root = await fixture(); const ctx = await legacy(root, true); const lock = await readFile(ctx.paths.sourceLockPath, "utf8");
  await expect(migrateOfficialPackagePlugin(root)).rejects.toMatchObject({ code: "LEGACY_MODIFIED_OFFICIAL_PLUGIN" });
  expect(await readFile(path.join(ctx.paths.pluginsRoot, "composer/index.tsx"), "utf8")).toBe("// custom business code\n");
  expect(await readFile(ctx.paths.sourceLockPath, "utf8")).toBe(lock);
});
it("creates a thin custom Slot extension while retaining the official package Composer", async () => {
  const root = await fixture();
  const result = await createCustomPlugin(root, { pluginId: "company-action", basedOn: "composer",
    capabilities: ["conversation-composer-trailing-action"],
    placement: { type: "plugin_slot", parentInstanceId: "composer-main", slot: "trailingActions" },
  }, async () => {});
  expect(result.ownership).toBe("project_source");
  const ctx = await resourcePaths(root);
  const model = JSON.parse(await readFile(ctx.paths.appUIModelPath, "utf8"));
  expect(model.root.plugins[0].pluginId).toBe("composer");
  expect(model.root.plugins[0].slots.trailingActions[0].pluginId).toBe("company-action");
  expect(await readFile(ctx.paths.generatedPluginRegistryPath, "utf8")).toContain('@za38.03/agent-ui-plugins/composer');
  const manifest = JSON.parse(await readFile(path.join(ctx.paths.pluginsRoot, "company-action/manifest.json"), "utf8"));
  expect(manifest.slots).toBeUndefined();
});
it("allows a controlled custom replacement while preserving modified legacy source for semantic migration", async () => {
  const root = await fixture(); const ctx = await legacy(root, true);
  await createCustomPlugin(root, { pluginId: "company-composer", basedOn: "composer", replaceInstanceId: "composer-main" }, async () => {});
  expect(await readFile(path.join(ctx.paths.pluginsRoot, "composer/index.tsx"), "utf8")).toBe("// custom business code\n");
  expect(await readFile(ctx.paths.generatedPluginRegistryPath, "utf8")).toContain('./company-composer/definition');
  expect(await readFile(ctx.paths.generatedPluginRegistryPath, "utf8")).not.toContain('./composer/definition');
});
