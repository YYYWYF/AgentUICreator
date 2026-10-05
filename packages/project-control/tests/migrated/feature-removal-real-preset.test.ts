import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { minVersion } from "semver";
import { afterEach, describe, expect, it } from "vitest";
import { createDefaultAgentUIPresetRegistry, initializeAgentUIProject } from "@agent-ui/bootstrap";
import { loadAgentUISourceRegistry, resolveAgentUISourceItemClosure } from "@agent-ui/source-registry";
import { collectAppUIPluginLocations, parseAppUIModel, parseAppUIModelJson } from "../../src/framework/contracts/app-ui-model";
import { compileAppUIModel } from "../../src/framework/contracts/app-ui-compiler";
import { mutateAppUIModel } from "../../src/project/app-ui-transaction";
import { createAgentUIInitializationHost } from "../../src/project/bootstrap-host";
import { projectControlConfigForPaths, resolveAgentUIProjectPaths } from "../../src/project/agent-ui-project-paths";
import { installOfficialAgentUIResource } from "../../src/project/install-official-agent-ui-resource";
import { generatePluginRegistry } from "../../src/project/registry-generator";
import { verifyUIProject } from "../../src/verify-ui";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
const sourceRoot = "custom-ui";
const slash = "assistant-ui-slash-command-trigger-main";
const commands = "conversation-command-source-main";
const mention = "assistant-ui-mention-trigger-main";
const preserved = ["assistant-ui-composer-main", mention, "conversation-quote-main"];
const hash = (source: string | Buffer) => createHash("sha256").update(source).digest("hex");

async function project(mode: "assistant" | "embedded" | "platform") {
  const root = await mkdtemp(path.join(tmpdir(), "real-preset-feature-removal-"));
  roots.push(root);
  const registry = await loadAgentUISourceRegistry();
  const preset = createDefaultAgentUIPresetRegistry(parseAppUIModel).list().find(item => item.mode === mode)!;
  const items = preset.sourceItems!.flatMap(id => resolveAgentUISourceItemClosure(registry, id));
  const dependencies = Object.assign({}, ...items.map(item => item.packages ?? {})) as Record<string, string>;
  // Match the existing resource-install fixture: satisfy dependency preflight
  // without a network install. Source declarations and Host operations are real.
  await writeFile(path.join(root, "package.json"), JSON.stringify({ dependencies }));
  for (const [name, required] of Object.entries(dependencies)) {
    const directory = path.join(root, "node_modules", name);
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, "package.json"), JSON.stringify({ name, version: minVersion(required)!.version }));
  }
  await writeFile(path.join(root, "tsconfig.json"), JSON.stringify({ compilerOptions: {
    target: "ES2022", module: "ESNext", moduleResolution: "Bundler", jsx: "react-jsx", resolveJsonModule: true,
  }, include: [sourceRoot] }));
  await initializeAgentUIProject({ projectRoot: root, mode, sourceRoot }, createAgentUIInitializationHost());
  const paths = resolveAgentUIProjectPaths(root, { mode, sourceRoot });
  return { root, paths, config: projectControlConfigForPaths(paths), registry, preset };
}
type Fixture = Awaited<ReturnType<typeof project>>;
async function model(f: Fixture) {
  return parseAppUIModelJson(await readFile(f.paths.appUIModelPath, "utf8"));
}
async function ids(f: Fixture) {
  return collectAppUIPluginLocations(await model(f)).map(entry => entry.plugin.id);
}
async function remove(f: Fixture, instanceId: string) {
  return mutateAppUIModel(f.root, {
    appUIModelHash: hash(await readFile(f.paths.appUIModelPath)), featureRemoval: true,
    operations: [{ type: "remove_plugin_default", instanceId }],
  });
}
async function healthy(f: Fixture) {
  const current = await model(f);
  const generation = await generatePluginRegistry(f.root, current, { paths: f.paths, config: f.config });
  expect(generation.errors).toEqual([]);
  expect(() => compileAppUIModel(current, generation.activeComposition.compositionCatalog)).not.toThrow();
  expect((await verifyUIProject(f.root)).status).toBe("passed");
  return generation;
}
async function sourceHashes(f: Fixture) {
  const result = new Map<string, string>();
  for (const id of ["plugin/assistant-ui-slash-command-trigger", "plugin/conversation-command-source"]) {
    for (const file of f.registry.byId.get(id)!.loadedFiles) {
      const target = path.join(f.paths.sourceRoot, file.target);
      result.set(target, hash(await readFile(target)));
    }
  }
  // Feature Removal and resource restoration must preserve Source ownership too.
  result.set(f.paths.sourceLockPath, hash(await readFile(f.paths.sourceLockPath)));
  return result;
}
async function unchanged(files: Map<string, string>) {
  for (const [file, before] of files) expect(hash(await readFile(file)), file).toBe(before);
}

// Only the extra business Plugin is a fixture; default Composer/Trigger/Provider
// composition and Service declarations always come from the official preset.
async function addBusinessPlugin(f: Fixture, pluginId: string, property: "inject" | "provides", service: string) {
  const directory = path.join(f.paths.pluginsRoot, pluginId);
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, "manifest.json"), JSON.stringify({
    id: pluginId, name: pluginId, description: "Test business Service contract", version: "1.0.0",
    capabilities: property === "provides" ? ["headless", "plugin-service-provider"] : ["headless"],
  }));
  await writeFile(path.join(directory, "definition.ts"), `import manifest from "./manifest.json";
import { ${service} } from "../../services/composer-triggers";
export default { manifest, Component: () => null, ${property}: [${service}] };
`);
  await mutateAppUIModel(f.root, {
    appUIModelHash: hash(await readFile(f.paths.appUIModelPath)),
    operations: [{ type: "insert_plugin", plugin: { id: `${pluginId}-main`, pluginId, enabled: true }, target: { type: "application" } }],
  });
}

describe("real default preset Feature Removal", () => {
  it.each(["assistant", "embedded", "platform"] as const)("removes Slash composition and restores official resources in %s", async mode => {
    const f = await project(mode);
    expect(await model(f)).toEqual(f.preset.createAppUIModel());
    expect(await ids(f)).toEqual(expect.arrayContaining([slash, commands, ...preserved]));
    const initial = await healthy(f);
    expect(initial.serviceDependencies.plugins.find(item => item.pluginId === "assistant-ui-slash-command-trigger"))
      .toMatchObject({ optionalInject: ["conversation.slash-command-source"] });
    expect(initial.serviceDependencies.plugins.find(item => item.pluginId === "conversation-command-source"))
      .toMatchObject({ provides: ["conversation.slash-command-source"] });
    expect(initial.assets.find(item => item.pluginId === "conversation-command-source")!.authoring?.cleanup?.removeWhenUnused).toBe(true);
    const sources = await sourceHashes(f);
    const result = await remove(f, slash);
    expect(result.diff.plugins.removed.sort()).toEqual([slash, commands].sort());
    expect(await ids(f)).not.toContain(slash);
    expect(await ids(f)).not.toContain(commands);
    expect(await ids(f)).toEqual(expect.arrayContaining(preserved));
    await unchanged(sources);
    await healthy(f);

    for (const resource of ["conversation-command-source", "conversation-slash-commands"]) {
      await installOfficialAgentUIResource(f.root, resource);
    }
    const restored = await readFile(f.paths.appUIModelPath, "utf8");
    // Reinstalling uses existing managed source and is composition-idempotent.
    for (const resource of ["conversation-command-source", "conversation-slash-commands"]) {
      await installOfficialAgentUIResource(f.root, resource);
    }
    expect(await readFile(f.paths.appUIModelPath, "utf8")).toBe(restored);
    const locations = collectAppUIPluginLocations(await model(f));
    for (const instanceId of [slash, commands, ...preserved]) {
      expect(locations.filter(entry => entry.plugin.id === instanceId)).toHaveLength(1);
    }
    for (const pluginId of ["conversation-command-source", "assistant-ui-slash-command-trigger"]) {
      expect(locations.filter(entry => entry.plugin.pluginId === pluginId)).toHaveLength(1);
    }
    expect(locations.find(entry => entry.plugin.id === commands)!.target).toEqual({ type: "application" });
    expect(locations.find(entry => entry.plugin.id === slash)!.target).toEqual({ type: "plugin_slot", parentInstanceId: "assistant-ui-composer-main", slot: "triggers" });
    await unchanged(sources);
    await healthy(f);
  }, 60_000);

  it("retains the real Command Source for another required consumer", async () => {
    const f = await project("assistant");
    await addBusinessPlugin(f, "shared-command-consumer", "inject", "CONVERSATION_COMMAND_SOURCE");
    const sources = await sourceHashes(f);
    const result = await remove(f, slash);
    expect(result.diff.plugins.removed).toEqual([slash]);
    expect(await ids(f)).toEqual(expect.arrayContaining([commands, "shared-command-consumer-main", ...preserved]));
    await unchanged(sources);
    await healthy(f);
  }, 60_000);

  it("retains a business Mention Provider without explicit cleanup ownership", async () => {
    const f = await project("assistant");
    await addBusinessPlugin(f, "business-mention-source", "provides", "CONVERSATION_MENTION_SOURCE");
    const initial = await healthy(f);
    expect(initial.assets.find(item => item.pluginId === "business-mention-source")!.authoring?.cleanup?.removeWhenUnused).not.toBe(true);
    expect(initial.serviceDependencies.plugins.find(item => item.pluginId === "assistant-ui-mention-trigger"))
      .toMatchObject({ optionalInject: ["conversation.mention-source"] });
    const result = await remove(f, mention);
    expect(result.diff.plugins.removed).toEqual([mention]);
    expect(await ids(f)).toEqual(expect.arrayContaining(["business-mention-source-main", slash, commands, "assistant-ui-composer-main", "conversation-quote-main"]));
    await healthy(f);
  }, 60_000);
});
