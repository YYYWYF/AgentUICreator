import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import {
  cloneAppUIValue, collectAppUIPluginLocations, hasGeneratedAppUIId, parseAppUIModel,
} from "../src/framework/contracts/app-ui-model";
import { compileAppUIModel } from "../src/framework/contracts/app-ui-compiler";
import { stringifyAppUIModel } from "../src/project/app-ui-serialization";
import { appUIPluginRefs, resolveCreatorPluginRefs, withCreatorPluginRefs } from "../src/project/app-ui-plugin-refs";
import { inspectUIComposition } from "../src/project/project-inspector";
import { mutateAppUIModel } from "../src/project/app-ui-transaction";

const source = {
  applicationPlugins: [{ pluginId: "provider" }],
  root: { type: "slot", plugins: [{ pluginId: "surface", slots: {
    content: [{ pluginId: "item" }, { pluginId: "item", enabled: false }],
  } }] },
};
const catalog = {
  provider: { capabilities: ["headless"] },
  surface: { childSlots: { content: { description: "Items", cardinality: "many" as const, optional: true } } },
  item: {},
};
const instances = (model: ReturnType<typeof parseAppUIModel>) => collectAppUIPluginLocations(model).map(({ plugin }) => plugin);

it("generates unique deterministic runtime identities without mutating authoring JSON", () => {
  const before = structuredClone(source);
  const model = parseAppUIModel(source);
  const nodes = instances(model);
  expect(new Set(nodes.map(node => node.id)).size).toBe(4);
  expect(nodes.every(hasGeneratedAppUIId)).toBe(true);
  expect(compileAppUIModel(model, catalog)).toEqual(compileAppUIModel(parseAppUIModel(before), catalog));
  expect(compileAppUIModel(model, catalog)).toEqual(compileAppUIModel(parseAppUIModel(JSON.parse(stringifyAppUIModel(model))), catalog));
  expect(instances(parseAppUIModel(cloneAppUIValue(model)))).toEqual(nodes);
  expect(JSON.parse(stringifyAppUIModel(model))).toEqual(source);
  expect(source).toEqual(before);
  expect(instances(parseAppUIModel({ root: source.root, applicationPlugins: source.applicationPlugins })))
    .toEqual(nodes);
});

it("keeps legacy and auto-looking explicit IDs, and rejects empty/duplicate IDs", () => {
  const generated = instances(parseAppUIModel({ root: { type: "slot", plugins: [{ pluginId: "item" }] } }))[0]!.id;
  const model = parseAppUIModel({
    applicationPlugins: [{ id: generated, pluginId: "provider" }],
    root: { type: "slot", plugins: [{ pluginId: "item" }] },
  });
  const nodes = instances(model);
  expect(nodes.map(node => node.id)).toEqual([generated, `${generated}_1`]);
  expect(JSON.parse(stringifyAppUIModel(cloneAppUIValue(model)))).toEqual({
    applicationPlugins: [{ id: generated, pluginId: "provider" }],
    root: { type: "slot", plugins: [{ pluginId: "item" }] },
  });
  for (const id of ["", " ", null]) expect(() => parseAppUIModel({ root: { type: "slot", plugins: [{ id, pluginId: "item" }] } })).toThrow();
  expect(() => parseAppUIModel({ root: { type: "slot", plugins: [{ id: "legacy", pluginId: "item" }, { id: "legacy", pluginId: "item" }] } })).toThrow();
});

it("uses snapshot references without colliding with legacy IDs or Plugin IDs", () => {
  const model = parseAppUIModel({ root: { type: "slot", plugins: [{ id: "p0", pluginId: "item" }, { pluginId: "p1" }] } });
  const implicit = instances(model)[1]!;
  expect(appUIPluginRefs(model).byRef.get("p1")).toBe(implicit.id);
  expect(withCreatorPluginRefs({ instanceId: implicit.id, pluginId: "p1", parentInstanceId: "p0" }, model))
    .toEqual({ instanceId: "p1", pluginId: "p1", parentInstanceId: "p0" });
  expect(resolveCreatorPluginRefs({ instanceId: "p1", pluginId: "p1", parentInstanceId: "p0" }, model))
    .toEqual({ instanceId: implicit.id, pluginId: "p1", parentInstanceId: "p0" });
});

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), "app-ui-identity-")); roots.push(root);
  for (const dir of [".agent-ui", "agent-ui/app-ui", "agent-ui/plugins/sample"]) await mkdir(path.join(root, dir), { recursive: true });
  await writeFile(path.join(root, "package.json"), JSON.stringify({ name: "identity-fixture", private: true }));
  await writeFile(path.join(root, "tsconfig.json"), JSON.stringify({ compilerOptions: { target: "ES2022", module: "ESNext" }, include: ["agent-ui/plugins/**/*.ts"] }));
  await writeFile(path.join(root, ".agent-ui/project.json"), JSON.stringify({ mode: "platform", sourceRoot: "agent-ui" }));
  await writeFile(path.join(root, "agent-ui/plugins/sample/manifest.json"), JSON.stringify({ id: "sample", name: "sample", description: "fixture", version: "1.0.0", capabilities: ["visual"], slots: { children: { content: { description: "Items", cardinality: "many", optional: true, accepts: { anyOfCapabilities: ["visual"] } } } } }));
  await writeFile(path.join(root, "agent-ui/plugins/sample/definition.ts"), 'const definition = { manifest: {}, Component: ({ renderSlot }) => renderSlot("content") }; export default definition;\n');
  const file = path.join(root, "agent-ui/app-ui/app-ui.json");
  await writeFile(file, JSON.stringify({ root: { type: "row", children: [{ type: "slot", plugins: [{ pluginId: "sample" }, { pluginId: "sample" }] }] } }));
  return { root, file };
}

it("inspects and edits ID-less instances through pN refs without saving generated IDs", async () => {
  const { root, file } = await fixture();
  for (const enabled of [false, true]) {
    const snapshot = await inspectUIComposition(root);
    expect(snapshot.pluginInstances.map(node => node.id).sort()).toEqual(["p0", "p1"]);
    await mutateAppUIModel(root, { appUIModelHash: snapshot.appUIModel.hash, operations: [{ type: "set_plugin_enabled", instanceId: "p1", enabled }] });
    const saved = JSON.parse(await readFile(file, "utf8"));
    expect(saved.root.children[0].plugins).toEqual([{ pluginId: "sample" }, { pluginId: "sample", ...(enabled ? {} : { enabled: false }) }]);
  }
  const snapshot = await inspectUIComposition(root);
  await writeFile(file, (await readFile(file, "utf8")) + "\n");
  await expect(mutateAppUIModel(root, { appUIModelHash: snapshot.appUIModel.hash, operations: [{ type: "remove_plugin", instanceId: "p0" }] }))
    .rejects.toMatchObject({ code: "APP_UI_MODEL_HASH_CONFLICT" });
});

it("resolves a whole edit batch against its original snapshot and normalizes after relocation", async () => {
  const { root, file } = await fixture();
  const hash = () => readFile(file, "utf8").then(source => createHash("sha256").update(source).digest("hex"));
  await mutateAppUIModel(root, { appUIModelHash: await hash(), operations: [
    { type: "remove_plugin", instanceId: "p0" },
    { type: "set_plugin_enabled", instanceId: "p1", enabled: false },
    { type: "insert_plugin", target: { type: "layout_slot", slotRef: "l1" }, index: 0, plugin: { pluginId: "sample" } },
  ] });
  expect(JSON.parse(await readFile(file, "utf8")).root.children[0].plugins)
    .toEqual([{ pluginId: "sample" }, { pluginId: "sample", enabled: false }]);
  const snapshot = await inspectUIComposition(root);
  await mutateAppUIModel(root, { appUIModelHash: snapshot.appUIModel.hash, operations: [
    { type: "move_plugin", instanceId: "p1", target: { type: "plugin_slot", parentInstanceId: "p0", slot: "content" }, index: 0 },
  ] });
  const saved = JSON.parse(await readFile(file, "utf8"));
  expect(saved.root.children[0].plugins).toEqual([{ pluginId: "sample", slots: { content: [{ pluginId: "sample", enabled: false }] } }]);
  const model = parseAppUIModel(saved);
  expect(instances(model).every(hasGeneratedAppUIId)).toBe(true);
});

it("keeps Creator action bindings and runtime receipts correct with implicit identities", async () => {
  const { root, file } = await fixture();
  await writeFile(file, JSON.stringify({ root: { type: "slot", plugins: [{ pluginId: "sample" }] } }));
  const directory = path.join(root, "agent-ui/plugins/addon");
  await mkdir(directory);
  await writeFile(path.join(directory, "manifest.json"), JSON.stringify({
    id: "addon", name: "Addon", description: "fixture", version: "1.0.0", capabilities: ["visual"],
    authoring: { intents: ["add addon"], defaultPlacement: { type: "plugin_slot", parentPluginId: "sample", slot: "content" } },
  }));
  await writeFile(path.join(directory, "definition.ts"), "const definition = { manifest: {}, Component: () => null }; export default definition;\n");
  const snapshot = await inspectUIComposition(root);
  const action = snapshot.creatorActions.candidates.find(candidate => candidate.kind === "add_existing_plugin" && candidate.target.pluginId === "addon" && candidate.effect.type === "add_default");
  expect(action, JSON.stringify({ diagnostics: snapshot.workspaceDiagnostics, addon: snapshot.capabilitySummaries.find(capability => capability.pluginId === "addon") })).toBeDefined();
  const result = await mutateAppUIModel(root, { appUIModelHash: snapshot.appUIModel.hash, operations: [{ type: "execute_creator_action", actionId: action!.actionId }] });
  const saved = JSON.parse(await readFile(file, "utf8"));
  expect(saved.root.plugins).toEqual([{ pluginId: "sample", slots: { content: [{ pluginId: "addon" }] } }]);
  const runtimeNodes = instances(parseAppUIModel(saved));
  expect(result.expectedRuntime?.presentInstanceIds).toEqual([runtimeNodes.find(node => node.pluginId === "addon")!.id]);
  expect(result.expectedPlacement).toMatchObject({ parentInstanceId: runtimeNodes.find(node => node.pluginId === "sample")!.id });
});
