import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, expect, it, vi } from "vitest";
import { RunActivity, restoreTransaction } from "../src/agent/activity.js";
import { createTools, visibleTool, type ToolContext } from "../src/agent/tools.js";
import { CreatorValidation } from "../src/agent/validation.js";
import { requestOperator } from "../src/agent/operator.js";
import { pluginFile } from "../src/agent/source-tools.js";

vi.mock("../src/agent/operator.js", async original => ({ ...await original<typeof import("../src/agent/operator.js")>(), requestOperator: vi.fn() }));
const roots: string[] = [];
const marker = "src/应用/plugins/card/application.json";
const content = '{"schemaVersion":1,"pluginId":"card"}\r\n';
afterEach(async () => { vi.restoreAllMocks(); vi.mocked(requestOperator).mockReset(); for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), "Creator delete 中文-")); roots.push(root);
  await mkdir(path.join(root, ".agent-ui")); await mkdir(path.join(root, "src/应用/plugins/card"), { recursive: true });
  await writeFile(path.join(root, "package.json"), '{"name":"delete-host"}');
  await writeFile(path.join(root, ".agent-ui/project.json"), '{"sourceRoot":"src/应用"}');
  await writeFile(path.join(root, "src/应用/plugins/card/manifest.json"), '{"id":"card"}');
  await writeFile(path.join(root, "src/应用/plugins/card/definition.ts"), "export default {};\n");
  await writeFile(path.join(root, "src/应用/plugins/registry.generated.ts"), "// existing registry\n");
  await writeFile(path.join(root, marker), content);
  const signal = new AbortController().signal;
  const context: ToolContext = { root, threadId: "delete", skills: "", contracts: fileURLToPath(new URL("../contracts/creator", import.meta.url)), signal,
    readOnly: false, userMessage: "修复自定义插件", groups: new Set(), authorizedPlugins: new Set(), diagnostics: new Map(), verificationMode: "static_only",
    activity: new RunActivity(root, "delete-test", signal) };
  vi.spyOn(CreatorValidation.prototype, "ensureBaseline").mockResolvedValue({ staticErrors: new Set(), typeErrors: new Set(), typeCheck: { command: "typecheck", status: "passed", exitCode: 0, output: "", truncated: false, revision: 0 } });
  await createTools(context);
  return context;
}
const observe = (context: ToolContext, file = marker) => context.hostTools!.get("read_file")!({ file_path: file, offset: 0, limit: 2000 });
const remove = (context: ToolContext, file = marker) => context.hostTools!.get("delete_ui_source_file")!({ path: file });

it("exposes a normal source deletion with exact undo/reapply", async () => {
  const context = await fixture();
  expect(visibleTool("delete_ui_source_file", context)).toBe(true);
  await expect(remove(context)).rejects.toThrow("read-before-edit");
  await observe(context); await expect(remove(context)).resolves.toMatchObject({ deleted: true, revision: 1 });
  await expect(readFile(path.join(context.root, marker))).rejects.toMatchObject({ code: "ENOENT" });
  const receipt = await context.activity.persist();
  expect(receipt.transaction).toMatchObject({ undoable: true, reapplyable: true });
  await restoreTransaction(context.root, context.activity.runId, "undo");
  expect(await readFile(path.join(context.root, marker), "utf8")).toBe(content);
  await restoreTransaction(context.root, context.activity.runId, "reapply");
  await expect(readFile(path.join(context.root, marker))).rejects.toMatchObject({ code: "ENOENT" });
});

it("preserves a file that changed after the observed read", async () => {
  const context = await fixture(); await observe(context);
  await writeFile(path.join(context.root, marker), "changed by user\n");
  await expect(remove(context)).rejects.toThrow("stale-version");
  expect(await readFile(path.join(context.root, marker), "utf8")).toBe("changed by user\n");
  expect(context.activity.revision).toBe(0);
});

it.each([Buffer.from([0, 1, 2]), Buffer.from([0xff, 0xfe, 0x89])])("preserves non-text files that cannot establish a successful text read", async bytes => {
  const context = await fixture(); await writeFile(path.join(context.root, marker), bytes);
  await expect(observe(context)).rejects.toThrow("CREATOR_TEXT_FILE_REQUIRED");
  await expect(remove(context)).rejects.toThrow("read-before-edit");
  expect(await readFile(path.join(context.root, marker))).toEqual(bytes);
  expect(context.activity.revision).toBe(0);
});

it.each(["package.json", "src/应用/plugins/registry.generated.ts", "src/应用/runtime/index.ts", "src/应用/Runtime/index.ts", "src/应用/Framework/index.ts", "src/应用/plugins/card/upstream/index.ts", "src/应用/plugins/card/UPSTREAM/index.ts", "src/应用/plugins/new-card/index.tsx", "src/应用/Plugins/new-card/index.tsx"])("retains existing write guards for %s", async file => {
  const context = await fixture();
  await expect(remove(context, file)).rejects.toThrow(/TOOL_PERMISSION_DENIED|PLUGIN_DEVELOPMENT_AUTHORIZATION_REQUIRED/u);
  expect(context.activity.revision).toBe(0);
  expect(await readFile(path.join(context.root, marker), "utf8")).toBe(content);
});

it("keeps npm implementation takeover checks for case aliases of Plugins/source", async () => {
  const context = await fixture();
  vi.mocked(requestOperator).mockResolvedValue({ application: { implementationOwnership: "npm" } } as any);
  await expect(remove(context, "src/应用/Plugins/card/SOURCE/index.tsx")).rejects.toThrow("PLUGIN_SOURCE_TAKEOVER_REQUIRED");
  expect(context.activity.revision).toBe(0);
});

it.each(["Runtime/index.ts", "UPSTREAM/index.ts", "Vendors/index.ts", "Node_Modules/index.ts"])("keeps atomic Plugin creation paths protected for %s", relative => {
  expect(() => pluginFile("card", relative, "src/应用")).toThrow("PLUGIN_SOURCE_PATH_INVALID");
});

it("does not delete during read-only requests", async () => {
  const context = await fixture(); await observe(context); context.readOnly = true;
  expect(visibleTool("delete_ui_source_file", context)).toBe(false);
  await expect(remove(context)).rejects.toThrow("TOOL_PERMISSION_DENIED");
  expect(await readFile(path.join(context.root, marker), "utf8")).toBe(content);
});

it("synchronizes the registry when an application marker is deleted", async () => {
  const context = await fixture(); await observe(context); await remove(context);
  vi.mocked(requestOperator).mockImplementation(async (_root, operation) => {
    if (operation === "synchronize_plugin_registry") throw new Error("observed registry synchronization");
    return { status: "passed", errors: [] } as any;
  });
  await expect(context.validation!.validate({})).rejects.toThrow("observed registry synchronization");
  expect(vi.mocked(requestOperator).mock.calls.some(call => call[1] === "synchronize_plugin_registry")).toBe(true);
});
