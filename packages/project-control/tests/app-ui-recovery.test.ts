import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { inspectAppUIModelSource, repairAppUIModel } from "../src/project/app-ui-recovery";
import * as registryGenerator from "../src/project/registry-generator";
import { appUIModelDiagnostics } from "../src/project/app-ui-diagnostics";
import { AppUICompilerError } from "../src/framework/contracts/app-ui-compiler";
import { validateProjectControlResult } from "../src/result-contract.mjs";
import { handleUIProjectControlRequest } from "../src/handler";

const roots: string[] = [];
const plugin = { id: "sample-main", pluginId: "sample", enabled: true };
const valid = { root: { type: "row", children: [{ type: "slot", plugins: [plugin] }], sizes: ["1fr"] } };
async function project(value: unknown = valid) {
  const root = await mkdtemp(path.join(tmpdir(), "app-ui-recovery-")); roots.push(root);
  for (const dir of [".agent-ui", "agent-ui/app-ui", "agent-ui/plugins/sample"]) await mkdir(path.join(root, dir), { recursive: true });
  await writeFile(path.join(root, "package.json"), JSON.stringify({ name: "recovery-fixture", private: true }));
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
  it("keeps a healthy model with broken Plugin child Slot source in normal debugging", async () => {
    const root = await project();
    await writeFile(path.join(root, "agent-ui/plugins/sample/definition.ts"), 'const definition = { manifest: {}, Component: ({renderSlot}) => renderSlot("undeclared") }; export default definition;');
    const observed = await inspectAppUIModelSource(root);
    expect(observed.status).toBe("valid");
    const inspected = await handleUIProjectControlRequest({ operation: "inspect_ui_project", input: { view: "composition" } }, root);
    expect(inspected, JSON.stringify(inspected)).toMatchObject({ ok: true, result: { workspaceDiagnostics: [expect.objectContaining({ code: "plugin-child-slot-rendered-not-declared", pluginId: "sample", path: "agent-ui/plugins/sample/definition.ts", slot: "undeclared" })] } });
    expect(await handleUIProjectControlRequest({ operation: "inspect_ui_project", input: {} }, root)).toMatchObject({ ok: true, result: { issues: expect.arrayContaining([expect.objectContaining({ code: "plugin-child-slot-rendered-not-declared" })]) } });
    await expect(repairAppUIModel(root, { expectedRawHash: observed.rawHash, candidateModel: { root: { type: "slot", plugins: [] } } })).rejects.toMatchObject({ code: "APP_UI_MODEL_RECOVERY_NOT_REQUIRED" });
    expect(JSON.parse(await readFile(modelPath(root), "utf8"))).toEqual(valid);
  });

  it("re-enters normal inspection and shared semantic admission after repair", async () => {
    const root = await project("{");
    const observed = await inspectAppUIModelSource(root);
    await repairAppUIModel(root, { expectedRawHash: observed.rawHash, candidateModel: valid });
    const inspected = await handleUIProjectControlRequest({ operation: "inspect_ui_project", input: { view: "composition" } }, root);
    expect(inspected, JSON.stringify(inspected)).toMatchObject({ ok: true });
    const source = await inspectAppUIModelSource(root);
    const mutated = await handleUIProjectControlRequest({ operation: "mutate_app_ui_model", input: { appUIModelHash: source.rawHash, operations: [{ type: "set_plugin_enabled", instanceId: "sample-main", enabled: false }] } }, root);
    expect(mutated).toMatchObject({ ok: true, result: { changed: true } });
    expect((await inspectAppUIModelSource(root)).status).toBe("valid");
  });

  it("retains strict workspace source admission for a genuinely broken model", async () => {
    const root = await project("{");
    await writeFile(path.join(root, "agent-ui/plugins/sample/definition.ts"), 'const definition = { manifest: {}, Component: ({renderSlot}) => renderSlot("undeclared") }; export default definition;');
    const observed = await inspectAppUIModelSource(root);
    await expect(repairAppUIModel(root, { expectedRawHash: observed.rawHash, candidateModel: valid })).rejects.toMatchObject({ code: "APP_UI_MODEL_REPAIR_WORKSPACE_INTEGRITY", details: { diagnostics: [expect.objectContaining({ code: "plugin-child-slot-rendered-not-declared", pluginId: "sample", path: "agent-ui/plugins/sample/definition.ts", slot: "undeclared" })] } });
    expect(await readFile(modelPath(root), "utf8")).toBe("{");
  });
  it.each(["syntax", "missing export", "missing file"])("does not classify Plugin definition %s errors as model corruption", async kind => {
    const root = await project();
    const definitionPath = path.join(root, "agent-ui/plugins/sample/definition.ts");
    if (kind === "missing file") await rm(definitionPath);
    else await writeFile(definitionPath, kind === "syntax" ? "export default {" : "export const definition = {};");
    expect((await inspectAppUIModelSource(root)).status).toBe("valid");
    const inspected = await handleUIProjectControlRequest({ operation: "inspect_ui_project", input: { view: "composition" } }, root);
    expect(inspected, JSON.stringify(inspected)).toMatchObject({ ok: true, result: { workspaceDiagnostics: expect.arrayContaining([expect.objectContaining({ code: kind === "syntax" ? "selected-plugin-definition-parse" : kind === "missing file" ? "selected-plugin-definition-missing" : "selected-plugin-default-export-missing" })]) } });
  });
  it("reports source inventory corruption as workspace integrity, without a Recovery baseline", async () => {
    const root = await project();
    await writeFile(path.join(root, "agent-ui/plugins/sample/manifest.json"), "{");
    const source = await handleUIProjectControlRequest({ operation: "inspect_app_ui_model_source", input: {} }, root);
    expect(source).toMatchObject({ ok: false, error: { code: "APP_UI_MODEL_WORKSPACE_INTEGRITY", details: { diagnostics: [expect.objectContaining({ phase: "workspace", code: "plugin-manifest-invalid", path: "agent-ui/plugins/sample/manifest.json" })] } } });
    expect(await handleUIProjectControlRequest({ operation: "inspect_ui_project", input: { view: "composition" } }, root)).toMatchObject({ ok: true, result: { workspaceDiagnostics: expect.any(Array) } });
  });
  it("collects healthy Composition facts once instead of running a preliminary admission", async () => {
    const root = await project();
    const spy = vi.spyOn(registryGenerator, "collectPluginProjectFacts");
    try {
      expect(await handleUIProjectControlRequest({ operation: "inspect_ui_project", input: { view: "composition" } }, root)).toMatchObject({ ok: true });
      expect(spy).toHaveBeenCalledTimes(1);
    } finally { spy.mockRestore(); }
  });
  it("preserves compiler issue envelopes for inspection and rejected candidates", async () => {
    const broken = { root: { type: "slot", plugins: [{ ...plugin, slots: { absent: [{ ...plugin, id: "child" }] } }] } };
    const root = await project(broken);
    const observed = await inspectAppUIModelSource(root);
    expect(observed).toMatchObject({ status: "composition_invalid", diagnostics: expect.arrayContaining([expect.objectContaining({ phase: "composition", code: "plugin-slot-not-declared", path: "root.plugins[0].slots.absent", instanceId: "sample-main", pluginId: "sample", slot: "absent" })]) });
    await expect(repairAppUIModel(root, { expectedRawHash: observed.rawHash, candidateModel: broken })).rejects.toMatchObject({ code: "APP_UI_MODEL_REPAIR_CANDIDATE_INVALID", details: { diagnostics: expect.arrayContaining([expect.objectContaining({ phase: "composition", code: "plugin-slot-not-declared", path: "root.plugins[0].slots.absent", instanceId: "sample-main", pluginId: "sample", slot: "absent" })]) } });
  });
  it("retains every compiler issue and rejects diagnostic contract drift", () => {
    const issues = [
      { code: "plugin-slot-required" as const, path: "root.plugins[0].slots.content", message: "content required", pluginId: "sample", instanceId: "sample-main", slot: "content" },
      { code: "plugin-slot-cardinality" as const, path: "root.plugins[0].slots.content", message: "one child allowed", pluginId: "sample", instanceId: "sample-main", slot: "content" },
    ];
    const diagnostics = appUIModelDiagnostics(new AppUICompilerError(issues), "candidate");
    expect(diagnostics).toEqual(issues.map(issue => ({ ...issue, phase: "composition" })));
    const result = { source: "{}", rawHash: "a".repeat(64), status: "composition_invalid", diagnostics };
    expect(() => validateProjectControlResult("inspect_app_ui_model_source", result)).not.toThrow();
    expect(() => validateProjectControlResult("inspect_app_ui_model_source", { ...result, diagnostics: [{ phase: "composition", code: "bad", message: "bad" }] })).toThrow();
    expect(() => validateProjectControlResult("inspect_app_ui_model_source", { ...result, diagnostics: [{ ...diagnostics[0], repairHint: "guess" }] })).toThrow();
  });

});
