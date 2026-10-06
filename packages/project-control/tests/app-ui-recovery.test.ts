import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { inspectAppUIModelSource, repairAppUIModel } from "../src/project/app-ui-recovery";
import { handleUIProjectControlRequest } from "../src/handler";

const roots: string[] = [];
const plugin = { id: "sample-main", pluginId: "sample", enabled: true };
const valid = { root: { type: "row", children: [{ type: "slot", plugins: [plugin] }], sizes: ["1fr"] } };
async function project(value: unknown = valid) {
  const root = await mkdtemp(path.join(tmpdir(), "app-ui-recovery-")); roots.push(root);
  for (const dir of [".agent-ui", "agent-ui/app-ui", "agent-ui/plugins/sample"]) await mkdir(path.join(root, dir), { recursive: true });
  await writeFile(path.join(root, ".agent-ui/project.json"), JSON.stringify({ mode: "platform", sourceRoot: "agent-ui" }));
  await writeFile(path.join(root, "agent-ui/plugins/sample/manifest.json"), JSON.stringify({ id: "sample", name: "sample", description: "fixture", version: "1.0.0" }));
  await writeFile(path.join(root, "agent-ui/plugins/sample/definition.ts"), "const definition = { manifest: {}, Component: () => null }; export default definition;\n");
  await writeFile(path.join(root, "agent-ui/app-ui/app-ui.json"), typeof value === "string" ? value : JSON.stringify(value));
  return root;
}
const modelPath = (root: string) => path.join(root, "agent-ui/app-ui/app-ui.json");
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });

describe("invalid AppUIModel Recovery", () => {
  it.each([
    ["syntax", "{", "syntax_invalid"],
    ["children object", { root: { ...valid.root, children: valid.root.children[0] } }, "schema_invalid"],
    ["plugins object", { root: { type: "slot", plugins: plugin } }, "schema_invalid"],
    ["enabled string", { root: { type: "slot", plugins: [{ ...plugin, enabled: "true" }] } }, "schema_invalid"],
    ["required field", { root: { type: "slot" } }, "schema_invalid"],
    ["unknown property", { ...valid, unknown: true }, "schema_invalid"],
    ["invalid layout", { root: { type: "bad" } }, "schema_invalid"],
    ["track length", { root: { ...valid.root, sizes: [] } }, "schema_invalid"],
    ["activeIndex", { root: { type: "stack", children: valid.root.children, activeIndex: 9 } }, "schema_invalid"],
    ["minWidth greater than maxWidth", { root: { type: "panel", minWidth: 200, maxWidth: 100, child: valid.root } }, "schema_invalid"],
    ["duplicate instance", { root: { type: "slot", plugins: [plugin, plugin] } }, "schema_invalid"],
    ["unknown Plugin", { root: { type: "slot", plugins: [{ ...plugin, pluginId: "absent" }] } }, "composition_invalid"],
    ["undeclared child Slot", { root: { type: "slot", plugins: [{ ...plugin, slots: { absent: [{ ...plugin, id: "child" }] } }] } }, "composition_invalid"],
  ])("diagnoses %s without writes", async (_name, value, status) => {
    const root = await project(value);
    const before = await readFile(modelPath(root), "utf8");
    const result = await inspectAppUIModelSource(root);
    expect(result.status).toBe(status);
    expect(result.diagnostics.length).toBeGreaterThan(0);
    expect(JSON.stringify(result)).not.toContain("repairHint");
    expect(await readFile(modelPath(root), "utf8")).toBe(before);
  });
  it("reports array/object path and atomically repairs model, registry and revision", async () => {
    const root = await project({ root: { ...valid.root, children: valid.root.children[0] } });
    const observed = await inspectAppUIModelSource(root);
    expect(observed.diagnostics).toEqual(expect.arrayContaining([expect.objectContaining({ path: "/root/children", expected: "array", actual: "object" })]));
    const result = await repairAppUIModel(root, { expectedRawHash: observed.rawHash, candidateModel: valid });
    expect(result.changedPaths).toHaveLength(3);
    expect((await inspectAppUIModelSource(root)).status).toBe("valid");
    const revision = JSON.parse(await readFile(path.join(root, "agent-ui/app-ui/composition-revision.generated.json"), "utf8"));
    expect(revision.appUIModelHash).toBe(result.appUIModel.afterHash);
    expect(await readFile(path.join(root, "agent-ui/plugins/registry.generated.ts"), "utf8")).toContain("sample");
  });
  it("rejects healthy repair and stale hash", async () => {
    const root = await project(); const source = await inspectAppUIModelSource(root);
    await expect(repairAppUIModel(root, { expectedRawHash: source.rawHash, candidateModel: valid })).rejects.toMatchObject({ code: "APP_UI_MODEL_RECOVERY_NOT_REQUIRED" });
    await writeFile(modelPath(root), "{");
    await expect(repairAppUIModel(root, { expectedRawHash: source.rawHash, candidateModel: valid })).rejects.toMatchObject({ code: "APP_UI_MODEL_RECOVERY_HASH_CONFLICT" });
    expect(await readFile(modelPath(root), "utf8")).toBe("{");
  });
  it.each([{ root: { type: "slot", plugins: plugin } }, { root: { type: "slot", plugins: [{ ...plugin, pluginId: "absent" }] } }])("rejects invalid candidate without writes", async candidate => {
    const root = await project("{"); const source = await inspectAppUIModelSource(root);
    await expect(repairAppUIModel(root, { expectedRawHash: source.rawHash, candidateModel: candidate })).rejects.toMatchObject({ code: "APP_UI_MODEL_REPAIR_CANDIDATE_INVALID" });
    expect(await readFile(modelPath(root), "utf8")).toBe("{");
    await expect(readFile(path.join(root, "agent-ui/plugins/registry.generated.ts"))).rejects.toMatchObject({ code: "ENOENT" });
  });
  it("rolls back a crash midway through commit", async () => {
    const root = await project("{"); const source = await inspectAppUIModelSource(root);
    await expect(repairAppUIModel(root, { expectedRawHash: source.rawHash, candidateModel: valid }, { simulateCrashAfterRename: 1 })).rejects.toMatchObject({ code: "APP_UI_MODEL_REPAIR_COMMIT_FAILED" });
    expect(await readFile(modelPath(root), "utf8")).toBe("{");
    await expect(readFile(path.join(root, "agent-ui/plugins/registry.generated.ts"))).rejects.toMatchObject({ code: "ENOENT" });
  });
  it("rejects an external edit during admission", async () => {
    const root = await project("{"); const source = await inspectAppUIModelSource(root);
    await expect(repairAppUIModel(root, { expectedRawHash: source.rawHash, candidateModel: valid }, { beforeCommit: async () => { await writeFile(modelPath(root), "external"); } })).rejects.toMatchObject({ code: "APP_UI_MODEL_RECOVERY_HASH_CONFLICT" });
    expect(await readFile(modelPath(root), "utf8")).toBe("external");
  });
  it("normal project inspection returns APP_UI_MODEL_INVALID and source inspection remains available", async () => {
    const root = await project("{");
    expect(await handleUIProjectControlRequest({ operation: "inspect_ui_project", input: { view: "composition" } }, root)).toMatchObject({ ok: false, error: { code: "APP_UI_MODEL_INVALID" } });
    expect(await handleUIProjectControlRequest({ operation: "inspect_app_ui_model_source", input: {} }, root)).toMatchObject({ ok: true, result: { status: "syntax_invalid" } });
  });
  it("Plugin context remains inspectable while the model is broken", async () => {
    const root = await project("{");
    expect(await handleUIProjectControlRequest({ operation: "list_ui_plugins", input: {} }, root)).toMatchObject({ ok: true, result: { recoveryOnly: true, pluginAssets: [expect.objectContaining({ pluginId: "sample" })] } });
    expect(await handleUIProjectControlRequest({ operation: "inspect_ui_plugin", input: { pluginId: "sample" } }, root)).toMatchObject({ ok: true, result: { recoveryOnly: true, selected: false } });
  });
  it.each([
    ["headless", { capabilities: ["headless"] }],
    ["renderer", { requiresRenderScope: true }],
  ])("rejects %s Plugin in a Layout Slot", async (_name, override) => {
    const root = await project("{");
    const manifest = path.join(root, "agent-ui/plugins/sample/manifest.json");
    await writeFile(manifest, JSON.stringify({ ...JSON.parse(await readFile(manifest, "utf8")), ...override }));
    const observed = await inspectAppUIModelSource(root);
    await expect(repairAppUIModel(root, { expectedRawHash: observed.rawHash, candidateModel: valid })).rejects.toMatchObject({ code: "APP_UI_MODEL_REPAIR_CANDIDATE_INVALID" });
    expect(await readFile(modelPath(root), "utf8")).toBe("{");
  });
  it("rejects Slot cardinality overflow", async () => {
    const root = await project("{");
    const pluginRoot = path.join(root, "agent-ui/plugins/sample");
    const manifestPath = path.join(pluginRoot, "manifest.json");
    await writeFile(manifestPath, JSON.stringify({ ...JSON.parse(await readFile(manifestPath, "utf8")), slots: { children: { content: { description: "content", cardinality: "one", optional: true } } } }));
    await writeFile(path.join(pluginRoot, "definition.ts"), 'const definition = { manifest: {}, Component: ({renderSlot}) => renderSlot("content") }; export default definition;');
    const observed = await inspectAppUIModelSource(root);
    const candidate = { root: { type: "slot", plugins: [{ ...plugin, slots: { content: [{ ...plugin, id: "one" }, { ...plugin, id: "two" }] } }] } };
    await expect(repairAppUIModel(root, { expectedRawHash: observed.rawHash, candidateModel: candidate })).rejects.toMatchObject({ code: "APP_UI_MODEL_REPAIR_CANDIDATE_INVALID" });
    expect(await readFile(modelPath(root), "utf8")).toBe("{");
  });
  it("stops on a Plugin child Slot source contract violation", async () => {
    const root = await project();
    await writeFile(path.join(root, "agent-ui/plugins/sample/definition.ts"), 'const definition = { manifest: {}, Component: ({renderSlot}) => renderSlot("undeclared") }; export default definition;');
    const observed = await inspectAppUIModelSource(root);
    expect(observed.status).toBe("composition_invalid");
    await expect(repairAppUIModel(root, { expectedRawHash: observed.rawHash, candidateModel: { root: { type: "slot", plugins: [] } } })).rejects.toMatchObject({ code: "APP_UI_MODEL_REPAIR_WORKSPACE_INTEGRITY" });
    expect(JSON.parse(await readFile(modelPath(root), "utf8"))).toEqual(valid);
  });

  it("re-enters normal inspection and shared semantic admission after repair", async () => {
    const root = await project("{");
    const observed = await inspectAppUIModelSource(root);
    await repairAppUIModel(root, { expectedRawHash: observed.rawHash, candidateModel: valid });
    const inspected = await handleUIProjectControlRequest({ operation: "inspect_ui_project", input: { view: "composition" } }, root);
    expect(inspected).toMatchObject({ ok: true });
    const source = await inspectAppUIModelSource(root);
    const mutated = await handleUIProjectControlRequest({ operation: "mutate_app_ui_model", input: { appUIModelHash: source.rawHash, operations: [{ type: "set_plugin_enabled", instanceId: "sample-main", enabled: false }] } }, root);
    expect(mutated).toMatchObject({ ok: true, result: { changed: true } });
    expect((await inspectAppUIModelSource(root)).status).toBe("valid");
  });

});
