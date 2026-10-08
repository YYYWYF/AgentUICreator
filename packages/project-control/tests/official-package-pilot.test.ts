import { cp, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { afterEach, expect, it } from "vitest";
import { build } from "vite";
import { officialPackagePlugins, loadAgentUISourceRegistry } from "@agent-ui/source-registry";
import { resourcePaths } from "../src/project/optional-resource-paths";
import { collectPluginProjectFacts, generatePluginRegistry } from "../src/project/registry-generator";
import { buildCreatorAuthoringTargetCatalog } from "../src/project/creator-authoring-target-catalog";
import { createCustomPlugin } from "../src/project/create-custom-plugin";
import { migrateOfficialPackagePlugin } from "../src/project/migrate-official-package-plugin";
import { resolveAgentUISourceItems } from "../src/project/source-registry/installer";
import { sha256 } from "../src/project/source-registry/lock";
import { repositoryRoot } from "./support/generated-project";
const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), "official-package-pilot-")); roots.push(root);
  for (const directory of [".agent-ui", "src/agent-ui/app-ui", "src/agent-ui/plugins", "src/agent-ui/runtime", "node_modules/@agent-ui"]) await mkdir(path.join(root, directory), { recursive: true });
  await writeFile(path.join(root, ".agent-ui/project.json"), JSON.stringify({ mode: "assistant", sourceRoot: "src/agent-ui" }));
  await writeFile(path.join(root, "package.json"), JSON.stringify({ type: "module", scripts: { build: "vite build" } }));
  await symlink(path.join(repositoryRoot, "packages/plugins"), path.join(root, "node_modules/@agent-ui/plugins"));
  await symlink(path.join(repositoryRoot, "packages/project-control/node_modules/react"), path.join(root, "node_modules/react"));
  await cp(path.join(repositoryRoot, "packages/source-registry/registry/items/foundation-core-contracts/files/framework"), path.join(root, "src/agent-ui/framework"), { recursive: true });
  await writeFile(path.join(root, "src/agent-ui/runtime/composition.ts"), 'export const createPluginCapabilityCatalog = (entries: unknown[]) => entries;\n');
  await writeFile(path.join(root, "src/agent-ui/app-ui/app-ui.json"), JSON.stringify({ root: { type: "slot", plugins: [{ id: "composer-main", pluginId: "assistant-ui-composer", enabled: true }] } }));
  return root;
}
it("keeps reference source in Registry while installation materializes no official Composer files", async () => {
  const registry = await loadAgentUISourceRegistry();
  expect(registry.byId.get("plugin/assistant-ui-composer")!.loadedFiles).toHaveLength(3);
  const items = resolveAgentUISourceItems(registry, ["plugin/assistant-ui-composer"]);
  const item = items.find(item => item.id === "plugin/assistant-ui-composer")!;
  expect(item.loadedFiles).toEqual([]);
  expect(item.packages["@agent-ui/plugins"]).toBe("^0.1.0");
});
it("only selected package entries enter runtime registry; discovery and reference targets remain available", async () => {
  const root = await fixture(); const ctx = await resourcePaths(root);
  const model = JSON.parse(await readFile(ctx.paths.appUIModelPath, "utf8"));
  const facts = await collectPluginProjectFacts(root, ctx.config, ctx.paths);
  const result = await generatePluginRegistry(root, model, ctx);
  expect(result.errors).toEqual([]);
  expect(result.capabilityCatalog.pluginIds).toEqual(["assistant-ui-composer"]);
  expect(result.capabilityCatalog.source).toContain('import("@agent-ui/plugins/assistant-ui-composer")');
  expect(result.capabilityCatalog.source).not.toMatch(/feedback|reasoning|chart/);
  const catalog = await buildCreatorAuthoringTargetCatalog({ projectRoot: root, ...ctx, projectFacts: facts, applicationTargets: [] });
  expect(catalog.candidates.find(target => target.relatedPluginIds?.includes("assistant-ui-composer"))?.kind).toBe("official_plugin_reference");
  expect(catalog.bindings.every(binding => !binding.ownerRoot)).toBe(true);
});
it("rejects reserved IDs through Host creation and inventory", async () => {
  const root = await fixture();
  await expect(createCustomPlugin(root, { pluginId: "assistant-ui-composer" })).rejects.toMatchObject({ code: "PLUGIN_ID_RESERVED_BY_OFFICIAL" });
  const ctx = await resourcePaths(root); const official = officialPackagePlugins[0]!;
  await mkdir(path.join(ctx.paths.pluginsRoot, official.pluginId));
  await writeFile(path.join(ctx.paths.pluginsRoot, official.pluginId, "manifest.json"), JSON.stringify(official.manifest));
  expect((await collectPluginProjectFacts(root, ctx.config, ctx.paths)).inventoryIssues).toContainEqual(expect.objectContaining({ code: "PLUGIN_ID_RESERVED_BY_OFFICIAL" }));
});
it("creates a project-owned custom Composer, preserves instance Slots and actually builds selected registry", async () => {
  const root = await fixture();
  const result = await createCustomPlugin(root, { pluginId: "company-composer", basedOn: "assistant-ui-composer", replaceInstanceId: "composer-main" }, async staged => {
    await build({ root: staged, configFile: false, logLevel: "silent", build: { write: false,
      lib: { entry: path.join(staged, "src/agent-ui/plugins/registry.generated.ts"), formats: ["es"] },
    }, resolve: { alias: { "@agent-ui/react": path.join(repositoryRoot, "packages/react/dist/index.js"), "zod": path.join(repositoryRoot, "packages/project-control/node_modules/zod/index.js") } } });
  });
  expect(result.ownership).toBe("project_source"); expect(result.checks).toEqual(["build"]);
  const ctx = await resourcePaths(root); const model = JSON.parse(await readFile(ctx.paths.appUIModelPath, "utf8"));
  expect(model.root.plugins[0]).toMatchObject({ id: "composer-main", pluginId: "company-composer" });
  const source = await readFile(path.join(ctx.paths.pluginsRoot, "company-composer/index.tsx"), "utf8");
  expect(source).toContain("ConversationCanonicalComposer"); expect(source).not.toContain("AssistantUiComposerPlugin");
  const catalog = await buildCreatorAuthoringTargetCatalog({ projectRoot: root, ...ctx, projectFacts: await collectPluginProjectFacts(root, ctx.config, ctx.paths), applicationTargets: [] });
  expect(catalog.candidates.find(target => target.relatedPluginIds?.includes("company-composer"))?.kind).toBe("plugin_source");
  expect(await readFile(ctx.paths.generatedPluginRegistryPath, "utf8")).not.toContain('@agent-ui/plugins/assistant-ui-composer');
});
it("failed build leaves source and AppUIModel unchanged", async () => {
  const root = await fixture(); const ctx = await resourcePaths(root); const before = await readFile(ctx.paths.appUIModelPath, "utf8");
  await expect(createCustomPlugin(root, { pluginId: "company-composer", basedOn: "assistant-ui-composer", replaceInstanceId: "composer-main" }, async () => { throw new Error("build failed"); })).rejects.toThrow("build failed");
  expect(await readFile(ctx.paths.appUIModelPath, "utf8")).toBe(before);
  expect(await readdir(ctx.paths.pluginsRoot)).toEqual([]);
});
async function legacy(root: string, modified: boolean) {
  const ctx = await resourcePaths(root); const registry = await loadAgentUISourceRegistry(); const item = registry.byId.get("plugin/assistant-ui-composer")!;
  const files: Record<string, { sha256: string }> = {};
  for (const file of item.loadedFiles) {
    const destination = path.join(ctx.paths.sourceRoot, file.target); await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, file.content); files[file.target] = { sha256: sha256(file.content) };
  }
  await writeFile(ctx.paths.sourceLockPath, JSON.stringify({ sourceRoot: ctx.config.agentUI.sourceRoot, items: { [item.id]: { files } } }));
  if (modified) await writeFile(path.join(ctx.paths.pluginsRoot, "assistant-ui-composer/index.tsx"), "// custom business code\n");
  return ctx;
}
it("migrates unchanged baseline without changing AppUI ID", async () => {
  const root = await fixture(); const ctx = await legacy(root, false);
  expect(await migrateOfficialPackagePlugin(root)).toEqual({ changed: true });
  expect(await readdir(ctx.paths.pluginsRoot)).not.toContain("assistant-ui-composer");
  expect(await readFile(ctx.paths.generatedPluginRegistryPath, "utf8")).toContain('@agent-ui/plugins/assistant-ui-composer');
  expect(JSON.parse(await readFile(ctx.paths.sourceLockPath, "utf8")).items).toEqual({});
});
it("preserves modified legacy source and reports exact migration diagnostic", async () => {
  const root = await fixture(); const ctx = await legacy(root, true); const lock = await readFile(ctx.paths.sourceLockPath, "utf8");
  await expect(migrateOfficialPackagePlugin(root)).rejects.toMatchObject({ code: "LEGACY_MODIFIED_OFFICIAL_PLUGIN" });
  expect(await readFile(path.join(ctx.paths.pluginsRoot, "assistant-ui-composer/index.tsx"), "utf8")).toBe("// custom business code\n");
  expect(await readFile(ctx.paths.sourceLockPath, "utf8")).toBe(lock);
});
it("creates a thin custom Slot extension while retaining the official package Composer", async () => {
  const root = await fixture();
  const result = await createCustomPlugin(root, { pluginId: "company-action", basedOn: "assistant-ui-composer",
    capabilities: ["conversation-composer-trailing-action"],
    placement: { type: "plugin_slot", parentInstanceId: "composer-main", slot: "trailingActions" },
  }, async () => {});
  expect(result.ownership).toBe("project_source");
  const ctx = await resourcePaths(root);
  const model = JSON.parse(await readFile(ctx.paths.appUIModelPath, "utf8"));
  expect(model.root.plugins[0].pluginId).toBe("assistant-ui-composer");
  expect(model.root.plugins[0].slots.trailingActions[0].pluginId).toBe("company-action");
  expect(await readFile(ctx.paths.generatedPluginRegistryPath, "utf8")).toContain('@agent-ui/plugins/assistant-ui-composer');
  const manifest = JSON.parse(await readFile(path.join(ctx.paths.pluginsRoot, "company-action/manifest.json"), "utf8"));
  expect(manifest.slots).toBeUndefined();
});
it("allows a controlled custom replacement while preserving modified legacy source for semantic migration", async () => {
  const root = await fixture(); const ctx = await legacy(root, true);
  await createCustomPlugin(root, { pluginId: "company-composer", basedOn: "assistant-ui-composer", replaceInstanceId: "composer-main" }, async () => {});
  expect(await readFile(path.join(ctx.paths.pluginsRoot, "assistant-ui-composer/index.tsx"), "utf8")).toBe("// custom business code\n");
  expect(await readFile(ctx.paths.generatedPluginRegistryPath, "utf8")).toContain('./company-composer/definition');
  expect(await readFile(ctx.paths.generatedPluginRegistryPath, "utf8")).not.toContain('./assistant-ui-composer/definition');
});
