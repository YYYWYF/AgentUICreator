import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile, access } from "node:fs/promises";
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
import { generatePluginRegistry } from "../../src/project/registry-generator";
import { verifyUIProject } from "../../src/verify-ui";
import { inspectAgentUISources } from "../../src/project/source-registry/inspector";
import { planPluginPurge, purgeUIPlugin } from "../../src/project/plugin-purge";
import { commitPluginPurge, recoverPendingPluginPurge, PURGE_JOURNAL } from "../../src/project/plugin-purge-transaction";
import { readOptionalBuffer } from "../../src/project/source-registry/lock";
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


async function input(f: Fixture, pluginId = "assistant-ui-slash-command-trigger") {
  return { pluginId, appUIModelHash: hash(await readFile(f.paths.appUIModelPath)), sourceStateHash: (await inspectAgentUISources(f.root, f.config)).stateHash };
}
async function exists(target: string) { return access(target).then(() => true, () => false); }

describe("Host Plugin purge", () => {
  it("hide preserves source ownership and Providers", async () => {
    const f = await project("assistant");
    const before = await sourceHashes(f);
    await mutateAppUIModel(f.root, { appUIModelHash: hash(await readFile(f.paths.appUIModelPath)), operations: [{ type: "set_plugin_enabled", instanceId: slash, enabled: false }] });
    await unchanged(before);
    expect(await ids(f)).toContain(commands);
    expect(collectAppUIPluginLocations(await model(f)).find(({ plugin }) => plugin.id === slash)!.plugin.enabled).toBe(false);
  });
  it("plans without live writes and purges managed Slash and its orphan Provider", async () => {
    const f = await project("assistant");
    const before = await sourceHashes(f);
    const request = await input(f);
    const plan = await planPluginPurge(f.root, request);
    await unchanged(before);
    expect(plan.cleanupProviders).toContain(commands);
    expect(plan.managedItems).toEqual(expect.arrayContaining(["plugin/assistant-ui-slash-command-trigger", "plugin/conversation-command-source"]));
    const result = await purgeUIPlugin(f.root, request);
    expect(result.verification).toBe("passed");
    expect(await ids(f)).not.toContain(slash);
    expect(await ids(f)).not.toContain(commands);
    expect(await exists(path.join(f.paths.pluginsRoot, "assistant-ui-slash-command-trigger"))).toBe(false);
    expect(await exists(path.join(f.paths.pluginsRoot, "conversation-command-source"))).toBe(false);
    const lock = JSON.parse(await readFile(f.paths.sourceLockPath, "utf8"));
    expect(lock.items["plugin/assistant-ui-slash-command-trigger"]).toBeUndefined();
    expect(await exists(path.join(f.root, PURGE_JOURNAL))).toBe(false);
    expect(result.sourceStateHash).toBe((await inspectAgentUISources(f.root, f.config)).stateHash);
    await healthy(f);
  });
  it("retains a shared Provider for a disabled optional consumer", async () => {
    const f = await project("assistant");
    const directory = path.join(f.paths.pluginsRoot, "other-consumer");
    await mkdir(directory);
    await writeFile(path.join(directory, "manifest.json"), JSON.stringify({ id: "other-consumer", name: "Other", description: "Test consumer", version: "1.0.0", capabilities: ["headless"] }));
    await writeFile(path.join(directory, "definition.ts"), `import manifest from "./manifest.json";
import { CONVERSATION_COMMAND_SOURCE } from "../../services/composer-triggers";
export default { manifest, Component: () => null, optionalInject: [CONVERSATION_COMMAND_SOURCE] };`);
    await mutateAppUIModel(f.root, { appUIModelHash: hash(await readFile(f.paths.appUIModelPath)), operations: [{ type: "insert_plugin", plugin: { id: "other", pluginId: "other-consumer", enabled: false }, target: { type: "application" } }] });
    await purgeUIPlugin(f.root, await input(f));
    expect(await ids(f)).toContain(commands);
    expect(await exists(path.join(f.paths.pluginsRoot, "conversation-command-source"))).toBe(true);
  });
  it("removes every user-authored Plugin file and nested directory", async () => {
    const f = await project("assistant");
    const directory = path.join(f.paths.pluginsRoot, "business-card");
    await mkdir(path.join(directory, "nested"), { recursive: true });
    await writeFile(path.join(directory, "manifest.json"), JSON.stringify({ id: "business-card", name: "Card", description: "Test card", version: "1.0.0", capabilities: ["headless"] }));
    await writeFile(path.join(directory, "definition.ts"), 'import manifest from "./manifest.json"; export default { manifest, Component: () => null };');
    for (const file of ["index.tsx", "hooks.ts", "utils.ts", "styles.css", "nested/extra.ts"]) await writeFile(path.join(directory, file), "");
    await mutateAppUIModel(f.root, { appUIModelHash: hash(await readFile(f.paths.appUIModelPath)), operations: [{ type: "insert_plugin", plugin: { id: "card", pluginId: "business-card", enabled: true }, target: { type: "application" } }] });
    await purgeUIPlugin(f.root, await input(f, "business-card"));
    expect(await exists(directory)).toBe(false);
    await healthy(f);
  });
  it("rejects stale hashes without writes", async () => {
    const f = await project("assistant");
    const request = await input(f);
    const before = await sourceHashes(f);
    await expect(purgeUIPlugin(f.root, { ...request, appUIModelHash: "0".repeat(64) })).rejects.toMatchObject({ code: "APP_UI_MODEL_HASH_CONFLICT" });
    await expect(purgeUIPlugin(f.root, { ...request, sourceStateHash: "0".repeat(64) })).rejects.toMatchObject({ code: "AGENT_UI_SOURCE_STATE_CONFLICT" });
    await unchanged(before);
  });
  it("allows customized managed files but refuses unowned additions", async () => {
    const f = await project("assistant");
    const directory = path.join(f.paths.pluginsRoot, "assistant-ui-slash-command-trigger");
    const definition = path.join(directory, "definition.ts");
    await writeFile(definition, (await readFile(definition, "utf8")) + "\n// project customization\n");
    expect((await planPluginPurge(f.root, await input(f))).managedItems).toContain("plugin/assistant-ui-slash-command-trigger");
    await writeFile(path.join(directory, "unowned.ts"), "export const extra = true;");
    const before = await sourceHashes(f);
    await expect(purgeUIPlugin(f.root, await input(f))).rejects.toMatchObject({ code: "PLUGIN_PURGE_UNSAFE" });
    await unchanged(before);
  });
  it("preserves shared files and rejects source dependency ownership conflicts", async () => {
    const f = await project("assistant");
    const lock = JSON.parse(await readFile(f.paths.sourceLockPath, "utf8"));
    const shared = "services/composer-triggers.ts";
    const content = await readFile(path.join(f.paths.sourceRoot, shared));
    lock.items["plugin/assistant-ui-slash-command-trigger"].files[shared] = { sha256: hash(content) };
    await writeFile(f.paths.sourceLockPath, JSON.stringify(lock));
    await purgeUIPlugin(f.root, await input(f));
    expect(await readFile(path.join(f.paths.sourceRoot, shared))).toEqual(content);
  });
  it.each([1, 3, 6])("recovers the unified before state after crash at mutation %s", async count => {
    const f = await project("assistant");
    const plan = await planPluginPurge(f.root, await input(f));
    await expect(commitPluginPurge(f.root, plan.files, plan.directories, async () => {}, { simulateCrashAfterMutation: count })).rejects.toThrow("Simulated purge crash");
    const journal = JSON.parse(await readFile(path.join(f.root, PURGE_JOURNAL), "utf8"));
    journal.ownerPid = 2147483647;
    await writeFile(path.join(f.root, PURGE_JOURNAL), JSON.stringify(journal));
    await recoverPendingPluginPurge(f.root);
    for (const file of plan.files) expect((await readOptionalBuffer(path.join(f.root, file.path)))?.toString("base64") ?? null).toBe(file.before);
    expect(await exists(path.join(f.root, PURGE_JOURNAL))).toBe(false);
  });
  it("does not overwrite external edits when commit admission fails", async () => {
    const f = await project("assistant");
    const plan = await planPluginPurge(f.root, await input(f));
    await writeFile(f.paths.appUIModelPath, "externally changed");
    await expect(commitPluginPurge(f.root, plan.files, plan.directories, async () => {})).rejects.toMatchObject({ code: "PLUGIN_PURGE_STATE_CONFLICT" });
    expect(await readFile(f.paths.appUIModelPath, "utf8")).toBe("externally changed");
    expect(await exists(path.join(f.root, PURGE_JOURNAL))).toBe(false);
  });
  it("rolls back every domain after a file deletion failure", async () => {
    const f = await project("assistant");
    const plan = await planPluginPurge(f.root, await input(f));
    await expect(commitPluginPurge(f.root, plan.files, plan.directories, async () => {}, {
      beforeMutation: async file => { if (file.after === null) throw new Error("Injected deletion failure"); },
    })).rejects.toThrow("Injected deletion failure");
    for (const file of plan.files) expect((await readOptionalBuffer(path.join(f.root, file.path)))?.toString("base64") ?? null).toBe(file.before);
    expect(await exists(path.join(f.root, PURGE_JOURNAL))).toBe(false);
  });
  it("fails closed for installed items with unprovable source dependencies", async () => {
    const f = await project("assistant");
    const lock = JSON.parse(await readFile(f.paths.sourceLockPath, "utf8"));
    lock.items["unknown/consumer"] = { files: {} };
    await writeFile(f.paths.sourceLockPath, JSON.stringify(lock));
    const before = await sourceHashes(f);
    await expect(purgeUIPlugin(f.root, await input(f))).rejects.toMatchObject({ code: "AGENT_UI_SOURCE_ITEM_UNAVAILABLE" });
    await unchanged(before);
  });
  it("refuses symlink traversal before any live mutation", async () => {
    const f = await project("assistant");
    const before = await sourceHashes(f);
    await (await import("node:fs/promises")).symlink(f.paths.appUIModelPath, path.join(f.paths.pluginsRoot, "assistant-ui-slash-command-trigger", "unsafe-link.ts"));
    await expect(purgeUIPlugin(f.root, await input(f))).rejects.toMatchObject({ code: "AGENT_UI_SOURCE_PATH_CONFLICT" });
    await unchanged(before);
  });

  it("rejects an installed Source Item requiring the removed Provider", async () => {
    const f = await project("assistant");
    const lock = JSON.parse(await readFile(f.paths.sourceLockPath, "utf8"));
    lock.items["demo/composer-triggers"] = { files: {} };
    await writeFile(f.paths.sourceLockPath, JSON.stringify(lock));
    const before = await sourceHashes(f);
    await expect(purgeUIPlugin(f.root, await input(f))).rejects.toMatchObject({ code: "AGENT_UI_SOURCE_DEPENDENCY_IN_USE" });
    await unchanged(before);
  });

});
