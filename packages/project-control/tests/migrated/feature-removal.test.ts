import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { collectAppUIPluginLocations, type AppUIModel } from "../../src/framework/contracts/app-ui-model";
import { mutateAppUIModel } from "../../src/project/app-ui-transaction";
import { findOrphanedServiceProvidersAfterRemoval, type AnalyzedDeclarations } from "../../src/project/service-dependency-inspector";
import type { PluginAsset } from "../../src/project/types";

const instance = (pluginId: string, enabled = true) => ({ id: pluginId, pluginId, enabled });
function fixture() {
  const model: AppUIModel = {
    applicationPlugins: [instance("commands"), instance("directory")],
    root: { type: "slot", plugins: [instance("slash"), instance("mention"), instance("quote"), instance("composer")] },
  };
  const assets: PluginAsset[] = ["commands", "directory", "slash", "mention", "quote", "composer", "palette"].map((pluginId) => {
    const capabilities = ["commands", "directory"].includes(pluginId) ? ["headless", "plugin-service-provider"] : [];
    const authoring = { intents: ["test"], cleanup: { removeWhenUnused: pluginId === "commands" } };
    return {
      pluginId, name: pluginId, description: pluginId, directory: pluginId,
      manifestPath: `${pluginId}/manifest.json`, definitionPath: `${pluginId}/definition.ts`,
      capabilities, authoring,
      manifest: { id: pluginId, name: pluginId, description: pluginId, version: "1.0.0", capabilities, authoring },
    };
  });
  const declarations: AnalyzedDeclarations = { issues: [], seamPaths: new Map(), plugins: assets.map(({ pluginId }) => ({
    pluginId,
    provides: pluginId === "commands" ? ["command.service"] : pluginId === "directory" ? ["mention.service"] : [],
    inject: pluginId === "palette" ? ["command.service"] : [],
    optionalInject: pluginId === "slash" ? ["command.service"] : pluginId === "mention" ? ["mention.service"] : [],
  })) };
  return { model, assets, declarations };
}

describe("opted-in orphan Provider analysis", () => {
  it("finds only infrastructure affected by primary removal, without mutating the model", () => {
    const { model, assets, declarations } = fixture();
    const before = JSON.stringify(model);
    expect(findOrphanedServiceProvidersAfterRemoval(model, assets, declarations, new Set(["slash"]))).toEqual([
      { providerInstanceId: "commands", providerPluginId: "commands", services: ["command.service"] },
    ]);
    expect(JSON.stringify(model)).toBe(before);
    expect(findOrphanedServiceProvidersAfterRemoval(model, assets, declarations, new Set())).toEqual([]);
  });
  it.each(["inject", "optionalInject"] as const)("preserves a shared Provider for remaining %s, including disabled consumers", (property) => {
    const { model, assets, declarations } = fixture();
    declarations.plugins.find((entry) => entry.pluginId === "palette")!.inject = [];
    declarations.plugins.find((entry) => entry.pluginId === "palette")![property] = ["command.service"];
    model.root = { type: "slot", plugins: [instance("slash"), instance("palette", false)] };
    expect(findOrphanedServiceProvidersAfterRemoval(model, assets, declarations, new Set(["slash"]))).toEqual([]);
  });
  it("preserves user-owned Mention sources and unrelated orphan infrastructure", () => {
    const { model, assets, declarations } = fixture();
    expect(findOrphanedServiceProvidersAfterRemoval(model, assets, declarations, new Set(["mention"]))).toEqual([]);
    assets.find((asset) => asset.pluginId === "commands")!.authoring = undefined;
    expect(findOrphanedServiceProvidersAfterRemoval(model, assets, declarations, new Set(["slash"]))).toEqual([]);
  });
  it("allows a bounded cleanup closure through Service dependencies", () => {
    const { model, assets, declarations } = fixture();
    assets.find((asset) => asset.pluginId === "directory")!.authoring!.cleanup!.removeWhenUnused = true;
    declarations.plugins.find((entry) => entry.pluginId === "commands")!.inject = ["mention.service"];
    model.root = { type: "slot", plugins: [instance("slash")] };
    expect(findOrphanedServiceProvidersAfterRemoval(model, assets, declarations, new Set(["slash"]))
      .map((item) => item.providerInstanceId)).toEqual(["commands"]);
    expect(findOrphanedServiceProvidersAfterRemoval(model, assets, declarations, new Set(["slash", "commands"]))
      .map((item) => item.providerInstanceId)).toEqual(["directory"]);
  });
  it("retains Providers with application gates or child Slots", () => {
    const { model, assets, declarations } = fixture();
    const provider = assets.find((asset) => asset.pluginId === "commands")!;
    provider.applicationGate = { service: "command.service", priority: 0 };
    expect(findOrphanedServiceProvidersAfterRemoval(model, assets, declarations, new Set(["slash"]))).toEqual([]);
    provider.applicationGate = undefined;
    provider.childSlots = { content: { description: "Extra UI responsibility", cardinality: "many", mode: "content" } };
    expect(findOrphanedServiceProvidersAfterRemoval(model, assets, declarations, new Set(["slash"]))).toEqual([]);
  });
  it("requires every provided Service to have no consumer", () => {
    const { model, assets, declarations } = fixture();
    declarations.plugins.find((entry) => entry.pluginId === "commands")!.provides.push("mention.service");
    expect(findOrphanedServiceProvidersAfterRemoval(model, assets, declarations, new Set(["slash"]))).toEqual([]);
  });
  it("fails closed for unresolved declarations or additional responsibilities", () => {
    const { model, assets, declarations } = fixture();
    declarations.issues.push({ code: "unresolved", message: "Unknown consumer" });
    expect(findOrphanedServiceProvidersAfterRemoval(model, assets, declarations, new Set(["slash"]))).toEqual([]);
    declarations.issues = [];
    assets.find((asset) => asset.pluginId === "commands")!.capabilities.push("business-events");
    expect(findOrphanedServiceProvidersAfterRemoval(model, assets, declarations, new Set(["slash"]))).toEqual([]);
  });
});

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });
const hash = (source: string) => createHash("sha256").update(source).digest("hex");
async function project(mode: string, shared: boolean) {
  const root = await mkdtemp(path.join(tmpdir(), "feature-removal-")); roots.push(root);
  const { model, assets, declarations } = fixture();
  if (shared && model.root.type === "slot") model.root.plugins.push(instance("palette"));
  await mkdir(path.join(root, ".agent-ui"));
  await writeFile(path.join(root, ".agent-ui/project.json"), JSON.stringify({ mode, sourceRoot: "agent-ui" }));
  await mkdir(path.join(root, "agent-ui/app-ui"), { recursive: true });
  await mkdir(path.join(root, "agent-ui/services"));
  await writeFile(path.join(root, "agent-ui/services/test.ts"), 'export const COMMAND = "command.service"; export const MENTION = "mention.service";');
  await writeFile(path.join(root, "tsconfig.json"), JSON.stringify({ compilerOptions: { target: "ES2022", module: "ESNext", moduleResolution: "Bundler", resolveJsonModule: true, allowSyntheticDefaultImports: true }, include: ["agent-ui/**/*.ts"] }));
  const sourceFiles = new Map<string, string>();
  for (const asset of assets) {
    const directory = path.join(root, "agent-ui/plugins", asset.pluginId);
    await mkdir(directory, { recursive: true });
    const entry = declarations.plugins.find((item) => item.pluginId === asset.pluginId)!;
    const names = (services: string[]) => services.map((service) => service === "command.service" ? "COMMAND" : "MENTION").join(",");
    const source = `import manifest from "./manifest.json"; import { COMMAND, MENTION } from "../../services/test"; export default { manifest, Component: () => null, provides: [${names(entry.provides)}], inject: [${names(entry.inject)}], optionalInject: [${names(entry.optionalInject)}] };`;
    const file = path.join(directory, "definition.ts");
    await writeFile(file, source); sourceFiles.set(file, source);
    await writeFile(path.join(directory, "manifest.json"), JSON.stringify(asset.manifest));
  }
  const modelPath = path.join(root, "agent-ui/app-ui/app-ui.json");
  const source = JSON.stringify(model); await writeFile(modelPath, source);
  return { root, modelPath, source, sourceFiles };
}

describe("Feature Removal Host transaction", () => {
  it.each(["assistant", "embedded", "platform"])("removes opted-in infrastructure and permits restoring existing assets in %s mode", async (mode) => {
    const { root, modelPath, source, sourceFiles } = await project(mode, false);
    const result = await mutateAppUIModel(root, { appUIModelHash: hash(source), featureRemoval: true, operations: [{ type: "remove_plugin_default", instanceId: "slash" }] });
    expect(result.diff.plugins.removed).toEqual(["commands", "slash"]);
    const remaining = collectAppUIPluginLocations(JSON.parse(await readFile(modelPath, "utf8"))).map(({ plugin }) => plugin.id);
    expect(remaining.sort()).toEqual(["composer", "directory", "mention", "quote"]);
    for (const [file, original] of sourceFiles) expect(await readFile(file, "utf8")).toBe(original);
    const restore = await mutateAppUIModel(root, { appUIModelHash: result.appUIModel.afterHash, operations: [
      { type: "insert_plugin", plugin: instance("commands"), target: { type: "application" } },
      { type: "insert_plugin", plugin: instance("slash"), target: { type: "layout_slot", slotRef: "l0" } },
    ] });
    expect(restore.diff.plugins.added).toEqual(["commands", "slash"]);
  });
  it.each([false, true])("preserves shared Providers for featureRemoval=%s", async (featureRemoval) => {
    const { root, source } = await project("platform", true);
    const result = await mutateAppUIModel(root, { appUIModelHash: hash(source), featureRemoval, operations: [{ type: "remove_plugin", instanceId: "slash" }] });
    expect(result.diff.plugins.removed).toEqual(["slash"]);
  });
  it("entry-point removal preserves unused Provider composition", async () => {
    const { root, source } = await project("platform", false);
    const result = await mutateAppUIModel(root, { appUIModelHash: hash(source), operations: [{ type: "remove_plugin", instanceId: "slash" }] });
    expect(result.diff.plugins.removed).toEqual(["slash"]);
  });
});
