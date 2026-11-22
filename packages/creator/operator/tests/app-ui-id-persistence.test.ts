import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { collectAppUIPluginLocations, parseAppUIModel, type AppUIModel } from "../src/framework/contracts/app-ui-model";
import { inspectAppUIModelSource, repairAppUIModel } from "../src/project/app-ui-recovery";
import { appUIModelJsonHash, stripCopiedAppUIIds, stringifyAppUIModel } from "../src/project/app-ui-serialization";
import { mutateAppUIModel } from "../src/project/app-ui-transaction";
import { createSourceRootProjectFixture } from "./support/source-root-project-fixture";

const hash = (source: string) => createHash("sha256").update(source).digest("hex");
const parseJson = (source: string): unknown => JSON.parse(source);
const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

const authoring = () => ({
  root: {
    type: "column",
    children: [
      { type: "slot", plugins: [{ pluginId: "foo" }] },
      { type: "slot", plugins: [{ id: "auto_user_owned", pluginId: "foo", enabled: false }] },
    ],
  },
});

function copiedModel(source: string): AppUIModel {
  const copied = parseJson(JSON.stringify(parseAppUIModel(parseJson(source))));
  return parseAppUIModel(copied);
}

function expectAuthoring(source: string) {
  expect(parseJson(source)).toEqual({ root: { type: "stack", children: [authoring().root] } });
  const parsed = parseAppUIModel(parseJson(source));
  const locations = collectAppUIPluginLocations(parsed);
  expect(locations.find(({ plugin }) => plugin.enabled)?.plugin.id).not.toBe("auto_user_owned");
  expect(locations.find(({ plugin }) => !plugin.enabled)?.plugin.id).toBe("auto_user_owned");
}

async function fixture() {
  const result = await createSourceRootProjectFixture();
  roots.push(result.projectRoot);
  // Keep these transaction tests independent of official package delivery.
  const packageRoot = path.join(result.projectRoot, "node_modules", "@za38.03", "agent-ui-plugins");
  await mkdir(path.join(packageRoot, "dist"), { recursive: true });
  const identity = { name: "@za38.03/agent-ui-plugins", version: "0.0.0" };
  await writeFile(path.join(packageRoot, "package.json"), JSON.stringify({
    ...identity, exports: { "./catalog.json": "./dist/catalog.json" },
  }));
  await writeFile(path.join(packageRoot, "dist", "catalog.json"), JSON.stringify({
    schemaVersion: 1, package: identity, plugins: [],
  }));
  const source = `${JSON.stringify(authoring(), null, 2)}\r\n`;
  await writeFile(result.paths.appUIModelPath, source);
  return { ...result, source };
}

describe("AppUIModel authoring identities", () => {
  it("removes copied application and nested Plugin identities after JSON transport and layout moves", () => {
    const original = {
      applicationPlugins: [{ pluginId: "provider" }],
      root: { type: "slot", plugins: [{ pluginId: "parent", slots: { content: [{ pluginId: "child" }] } }] },
    };
    const source = JSON.stringify(original);
    const copied = structuredClone(parseAppUIModel(parseJson(source)));
    const candidate = { ...copied, root: { type: "stack", id: "main", viewIds: ["chat"], children: [copied.root] } };
    const cleaned = parseAppUIModel(stripCopiedAppUIIds(candidate, source));
    expect(parseJson(stringifyAppUIModel(cleaned))).toEqual({
      ...original, root: { type: "stack", id: "main", viewIds: ["chat"], children: [original.root] },
    });
    expect(candidate).toEqual({ ...copied, root: { type: "stack", id: "main", viewIds: ["chat"], children: [copied.root] } });
  });

  it("preserves explicit IDs even when they equal the ID the generator would otherwise choose", () => {
    const original = { root: { type: "slot", plugins: [{ pluginId: "foo" }] } };
    const source = JSON.stringify(original);
    const generatedId = collectAppUIPluginLocations(parseAppUIModel(original))[0]!.plugin.id;
    const explicit = { root: { type: "slot", plugins: [
      { pluginId: "foo", id: generatedId },
      { pluginId: "foo", id: "auto_new_explicit", enabled: false },
    ] } };
    const explicitSource = JSON.stringify(explicit);
    const cleaned = parseAppUIModel(stripCopiedAppUIIds(copiedModel(explicitSource), explicitSource));
    expect(parseJson(stringifyAppUIModel(cleaned))).toEqual(explicit);
    const candidate = { root: { type: "slot", plugins: [{ pluginId: "foo", id: "auto_new_explicit" }] } };
    expect(stripCopiedAppUIIds(candidate, source)).toEqual(candidate);
  });

  it("does not guess that an unknown explicit ID is generated when the original JSON cannot be parsed", () => {
    const candidate = { root: { type: "slot", plugins: [{ pluginId: "foo", id: "auto_explicit" }] } };
    expect(stripCopiedAppUIIds(candidate, '{"root":')).toEqual(candidate);
  });
});

it("does not persist copied derived IDs through a controlled layout replacement", async () => {
  const { projectRoot, paths, source } = await fixture();
  const copied = copiedModel(source);
  await mutateAppUIModel(projectRoot, {
    appUIModelHash: hash(source),
    operations: [{ type: "replace_layout_node", nodeRef: "l0", node: { type: "stack", children: [copied.root] } }],
  });
  const saved = await readFile(paths.appUIModelPath, "utf8");
  expectAuthoring(saved);
  // Further edits use the regenerated identity, and never make it explicit.
  const instance = collectAppUIPluginLocations(parseAppUIModel(parseJson(saved)))[0]!.plugin;
  await mutateAppUIModel(projectRoot, {
    appUIModelHash: hash(saved), operations: [{ type: "set_plugin_enabled", instanceId: instance.id, enabled: false }],
  });
  const after = await readFile(paths.appUIModelPath, "utf8");
  expect(after).not.toContain(`"id": "${instance.id}"`);
  expect(after).toContain('"id": "auto_user_owned"');
});

it("keeps a copied identity derived when replacing its Plugin implementation", async () => {
  const { projectRoot, paths, source } = await fixture();
  const directory = path.join(paths.pluginsRoot, "bar");
  await mkdir(directory);
  await writeFile(path.join(directory, "manifest.json"), JSON.stringify({
    id: "bar", name: "Bar", description: "Replacement fixture plugin", version: "1.0.0", capabilities: ["visual"],
  }));
  await writeFile(path.join(directory, "definition.ts"), "const definition = { manifest: {}, Component: () => null };\nexport default definition;\n");
  const copied = collectAppUIPluginLocations(copiedModel(source))[0]!.plugin;
  await mutateAppUIModel(projectRoot, {
    appUIModelHash: hash(source),
    operations: [{ type: "replace_plugin", instanceId: copied.id, replacement: { ...copied, pluginId: "bar" } }],
  });
  const saved = await readFile(paths.appUIModelPath, "utf8");
  const expected = authoring();
  expected.root.children[0]!.plugins[0]!.pluginId = "bar";
  expect(parseJson(saved)).toEqual(expected);
  expect((await inspectAppUIModelSource(projectRoot)).status).toBe("valid");
});

it.each(["schema", "composition"] as const)("does not persist copied derived IDs when repairing %s-invalid configuration", async failure => {
  const { projectRoot, paths, source } = await fixture();
  const invalid = failure === "schema"
    ? { ...authoring(), unsupported: true }
    : { root: { ...authoring().root, children: [...authoring().root.children, { type: "slot", plugins: [{ pluginId: "missing" }] }] } };
  await writeFile(paths.appUIModelPath, JSON.stringify(invalid));
  const current = await inspectAppUIModelSource(projectRoot);
  expect(current.status).toBe(`${failure}_invalid`);
  const copied = copiedModel(source);
  const result = await repairAppUIModel(projectRoot, {
    expectedRawHash: current.rawHash,
    candidateModel: { ...copied, root: { type: "stack", children: [copied.root] } },
  });
  const saved = await readFile(paths.appUIModelPath, "utf8");
  expectAuthoring(saved);
  expect(result.appUIModel.afterHash).toBe(hash(saved));
  const revision: unknown = JSON.parse(await readFile(path.join(paths.sourceRoot, "composition-revision.generated.json"), "utf8"));
  expect(revision).toMatchObject({ appUIModelHash: hash(saved), appUIModelJsonHash: appUIModelJsonHash(saved) });
  expect((await inspectAppUIModelSource(projectRoot)).status).toBe("valid");
});
