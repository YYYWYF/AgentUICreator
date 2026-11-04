import { afterEach, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { AIMessage, type BaseMessage } from "@langchain/core/messages";
import { DebuggingEvidence, staticTargetId } from "../src/agent/debugging.js";
import { RunActivity } from "../src/agent/activity.js";
import { createTools, visibleTool, type ToolContext } from "../src/agent/tools.js";
import { CreatorAgentRuntime } from "../src/agent/runner.js";
import { CreatorValidation } from "../src/agent/validation.js";
import { creatorContentHash } from "../src/agent/files/creatorFileState.js";
import { inspectEditingContext, findEditingTargets, requestedEditingPlugin } from "../src/agent/edit-context.js";
import { EditingSessionStore } from "../src/agent/editing-session.js";
import { inspectProject, projectInspectionSummary } from "../src/agent/inspection.js";
import { readProjectFile, logicalProjectPath } from "../src/agent/project-read.js";
import { preparePluginDirectory, projectPluginDirectory } from "../src/agent/plugin-directory.js";
import { assertRemovalScope, assertInstanceRetention, parseRemovalTarget, cancelExecution, removalInstanceIds } from "../src/agent/execution-decision.js";
import { namesRequestedPlugins, namesRequestedRemoval } from "../src/agent/plugin-target-names.js";
import { localModuleReferences } from "../src/agent/edit-context-sources.js";

const state = vi.hoisted(() => ({ model: undefined as any, inspect: vi.fn() }));
vi.mock("../src/agent/config.js", () => ({ hostEnvironment: () => ({ CREATOR_AGENT_MODE: "domain-write", CREATOR_VERIFICATION_MODE: "static_only" }), createModel: () => state.model }));
vi.mock("../src/agent/operator.js", async importOriginal => ({ ...await importOriginal<typeof import("../src/agent/operator.js")>(), requestOperator: state.inspect }));
const roots: string[] = [];
afterEach(async () => { vi.restoreAllMocks(); state.inspect.mockReset(); for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
const contracts = fileURLToPath(new URL("../contracts/creator", import.meta.url));
const entry = "src/应用/plugins/composer/index.tsx";
const css = "src/应用/plugins/composer/styles.css";
const original = "export const Composer = () => <Input placeholder=\"消息\" style={{minHeight: 48}} />;\n";
async function project(threadId = "edit") {
  const root = await mkdtemp(path.join(tmpdir(), "Creator edits 中文 ")); roots.push(root);
  for (const directory of [".agent-ui", "src/应用/plugins/composer", "src/应用/conversation/config", "skills"]) await mkdir(path.join(root, directory), { recursive: true });
  await writeFile(path.join(root, ".agent-ui/project.json"), JSON.stringify({ sourceRoot: "src/应用" }));
  await writeFile(path.join(root, "package.json"), '{"name":"edit-host"}');
  await writeFile(path.join(root, entry), original);
  await writeFile(path.join(root, css), ".composer { border-radius: 8px; }\n");
  await writeFile(path.join(root, "src/应用/plugins/composer/definition.ts"), "export default {};\n");
  await writeFile(path.join(root, "src/应用/plugins/composer/manifest.json"), '{"id":"composer"}');
  const context: ToolContext = { root, threadId, skills: path.join(root, "skills"), contracts,
    signal: new AbortController().signal, readOnly: false, userMessage: "把输入框高一点", groups: new Set(), authorizedPlugins: new Set(),
    diagnostics: new Map(), verificationMode: "static_only", activity: new RunActivity(root, threadId + "-1", new AbortController().signal) };
  return context;
}
function next(context: ToolContext, runId = "next", readOnly = false): ToolContext {
  const { editingSelection: _selection, validation: _validation, ...rest } = context;
  return { ...rest, activity: new RunActivity(context.root, runId, context.signal), groups: new Set(), authorizedPlugins: new Set(),
    readOnly, readRanges: new Map() };
}
async function inspectResult(root: string) {
  return { asset: { pluginId: "composer", name: "Composer", definitionPath: "src/应用/plugins/composer/definition.ts", manifestPath: "src/应用/plugins/composer/manifest.json" },
    application: { entryPath: entry, entryHash: creatorContentHash(await readFile(path.join(root, entry))), implementationOwnership: "npm",
      usageGuide: { customization: "Use application props first", currentExample: { source: original } },
      publicApi: { status: "available", package: { name: "@za38.03/agent-ui-plugins", version: "3.2.1" }, props: [{ name: "inputProps", type: "InputProps" }] } },
    instances: [{ id: "primary", pluginId: "composer" }, { id: "secondary", pluginId: "composer" }], services: {}, files: [{ path: css, kind: "file" }] };
}
function passingValidation() {
  vi.spyOn(CreatorValidation.prototype, "ensureBaseline").mockResolvedValue({ staticErrors: new Set(), typeErrors: new Set(), typeCheck: { command: "typecheck", status: "passed", exitCode: 0, output: "", truncated: false, revision: 0 } });
  vi.spyOn(CreatorValidation.prototype, "validate").mockImplementation(async function (this: CreatorValidation) {
    this.activity.validationRevision = this.activity.revision;
    this.activity.validations = [{ command: "verify_creator_delta", status: "passed", revision: this.activity.revision }];
    return { status: "passed", revision: this.activity.revision } as any;
  });
}

it("does not treat repeated-read recovery counters as new evidence, but recognizes changed files", async () => {
  const context = await project();
  const read = (await createTools(context)).find(tool => tool.name === "read_file")!;
  for (let index = 0; index < 8; index++) {
    const response = JSON.parse(await read.invoke({ file_path: entry, offset: 0, limit: 200 }));
    expect(response.ok).toBe(true);
    if (index >= 2) expect(response.result.recovery).toMatchObject({ action: "reuse_observed_file" });
    expect(context.evidenceRevision).toBe(1);
  }
  await writeFile(path.join(context.root, entry), original.replace("48", "56"));
  const changed = JSON.parse(await read.invoke({ file_path: entry, offset: 0, limit: 200 }));
  expect(changed.result.content).toContain("minHeight: 56");
  expect(context.evidenceRevision).toBe(2);
});

it("distinguishes ordered plugin moves and empty-Slot cleanup from actual removal", () => {
  const project = { appUIModel: { layout: { nodeRef: "root", children: [{ nodeRef: "old", children: [{ nodeRef: "inside" }] }, { nodeRef: "outside" }] } }, pluginInstances: [
    { id: "identity", target: { type: "layout_slot", slotRef: "old" } },
    { id: "theme", target: { type: "layout_slot", slotRef: "old" } },
  ] };
  const move = (instanceId: string, slotRef: string) => ({ type: "move_plugin", instanceId, target: { type: "layout_slot", slotRef } });
  const remove = { type: "remove_layout_node", nodeRef: "old" };
  expect([...removalInstanceIds({ operations: [move("identity", "$newIdentity"), move("theme", "$newTheme"), remove] }, project)]).toEqual([]);
  expect([...removalInstanceIds({ operations: [move("identity", "outside"), remove] }, project)]).toEqual(["theme"]);
  expect([...removalInstanceIds({ operations: [move("identity", "inside"), remove] }, project)]).toEqual(["identity", "theme"]);
  expect([...removalInstanceIds({ operations: [remove, move("identity", "outside")] }, project)]).toEqual(["identity", "theme"]);
  expect([...removalInstanceIds({ operations: [move("identity", "outside"), { type: "set_plugin_enabled", instanceId: "identity", enabled: false }] }, project)]).toEqual(["identity"]);
});

it("reads the known application and styles with installed API in one Agent tool call and permits a checked edit", async () => {
  const context = await project(); passingValidation();
  state.inspect.mockImplementation(async (_root, operation) => { expect(operation).toBe("inspect_ui_plugin"); return inspectResult(context.root); });
  const tools = await createTools(context);
  const tool = tools.find(item => item.name === "inspect_ui_edit_context")!;
  const result = JSON.parse(await tool.invoke({ pluginId: "composer" })).result;
  expect(result).toMatchObject({ status: "resolved", target: { entryPath: entry }, references: { publicApi: { package: { version: "3.2.1" } } } });
  expect(result.plugin.instances).toHaveLength(2);
  expect(result.files.map((file: any) => file.path)).toEqual(["/" + entry, "/src/应用/plugins/composer/definition.ts", "/src/应用/plugins/composer/manifest.json", "/" + css]);
  expect(context.activity.observations.get(entry)?.hash).toBe(result.files[0].hash);
  expect(state.inspect).toHaveBeenCalledTimes(1);
  await context.hostTools!.get("edit_file_from_read")!({ file_path: "/" + entry, mode: "replace_lines", start_line: 1, replacement: original.replace("48", "56") });
  expect(await readFile(path.join(context.root, entry), "utf8")).toContain("minHeight: 56");
  expect(context.authorizedPlugins.size).toBe(0);
});

it("preserves every returned installed API member and shared types without a second lossy truncation", async () => {
  const context = await project();
  const inspection = await inspectResult(context.root);
  const presentationContract = { presentation: "The editable field and its containing surface differ" };
  inspection.application.usageGuide = { ...inspection.application.usageGuide, presentationContract } as any;
  inspection.application.publicApi = { ...inspection.application.publicApi, presentationContract,
    props: Array.from({ length: 64 }, (_, index) => ({ name: `property${index}`, type: "x".repeat(500) })) } as any;
  (inspection.application as any).sharedTypes = { status: "available", symbols: [{ name: "UIPluginRenderProps" }] };
  state.inspect.mockResolvedValue(inspection);
  const result = await inspectEditingContext(context, { pluginId: "composer" });
  expect(result).toMatchObject({ references: { usageGuide: { presentationContract }, publicApi: { presentationContract }, sharedTypes: { status: "available" } } });
  expect(result).toMatchObject({ references: { publicApi: { props: inspection.application.publicApi.props } } });
});

it("resolves application-owned welcome content from the existing catalog instead of assuming a Plugin directory", async () => {
  const context = await project();
  const ownerPath = "src/应用/conversation/config/welcome.ts";
  await writeFile(path.join(context.root, ownerPath), 'export const welcome = "Hello";');
  state.inspect.mockResolvedValue({ authoringTargetCatalog: { revision: "catalog", candidates: [{ id: "conversation.welcome", kind: "application_config", name: "Welcome", description: "Welcome copy", intents: ["修改欢迎语"] }], bindings: [{ targetId: "conversation.welcome", ownerPath }] } });
  const result = await inspectEditingContext(context, { query: "欢迎语" });
  expect(result).toMatchObject({ status: "resolved", target: { id: "conversation.welcome", entryPath: ownerPath } });
  expect(context.activity.observations.get(ownerPath)?.exists).toBe(true);
  expect(state.inspect).toHaveBeenCalledExactlyOnceWith(context.root, "inspect_ui_project", { view: "composition" }, context.signal);
});

it("returns ambiguous owners without selecting an operation or treating a failed search as missing capability", async () => {
  const context = await project();
  state.inspect.mockResolvedValue({ authoringTargetCatalog: { candidates: ["one", "two"].map(id => ({ id, kind: "application_config", name: "Shared appearance", description: "Appearance" })), bindings: [] } });
  expect(await inspectEditingContext(context, { query: "appearance" })).toMatchObject({ status: "candidates", totalMatches: 2 });
  expect(context.editingSelection).toBeUndefined();
  expect(context.activity.observations.get(entry)).toBeUndefined();
  expect(await inspectEditingContext(context, { query: "not-a-known-owner" })).toMatchObject({ status: "not_found" });
  expect(findEditingTargets([{ id: "plugin-source:composer", kind: "plugin_source", name: "Composer", description: "", relatedPluginIds: ["composer"] }], "输入框")).toHaveLength(1);
});

it("preserves unavailable API evidence and falls back for a legacy layout without inventing a takeover", async () => {
  const context = await project(), inspected = await inspectResult(context.root);
  inspected.application.publicApi = { status: "unavailable", reason: "types missing" } as any;
  state.inspect.mockResolvedValue(inspected);
  expect(await inspectEditingContext(context, { pluginId: "composer" })).toMatchObject({ status: "resolved", references: { publicApi: { status: "unavailable" } } });
  state.inspect.mockResolvedValue({ asset: { pluginId: "legacy", definitionPath: "src/应用/plugins/legacy/definition.ts" } });
  expect(await inspectEditingContext(context, { pluginId: "legacy" })).toMatchObject({ status: "partial", target: { entryPath: "src/应用/plugins/legacy/definition.ts" }, coverage: { sourcesComplete: false } });
});

it("revokes aggregate read evidence when the inspected entry changes before it can be returned", async () => {
  const context = await project();
  state.inspect.mockImplementation(async () => {
    const result = await inspectResult(context.root);
    await writeFile(path.join(context.root, entry), "concurrent edit");
    return result;
  });
  await expect(inspectEditingContext(context, { pluginId: "composer" })).rejects.toThrow("EDITING_CONTEXT_STALE");
  expect(context.activity.observations.get(entry)).toBeUndefined();
  expect(context.readRanges?.get(entry)).toBeUndefined();
  expect(context.editingSelection).toBeUndefined();
});

it("returns a custom Plugin's real definition, nonstandard component, slots, styles and local Service contract", async () => {
  const context = await project(), directory = "src/应用/plugins/composer", definition = directory + "/definition.ts";
  await mkdir(path.join(context.root, directory, "presentation")); await mkdir(path.join(context.root, "src/应用/services"));
  await writeFile(path.join(context.root, definition), 'import { Card } from "./presentation/CardView.js"; export default { Component: Card };');
  await writeFile(path.join(context.root, directory, "presentation/CardView.tsx"), 'import type { HelpService } from "../../../services/help.js"; import "./card.css"; export const Card = () => null;');
  await writeFile(path.join(context.root, directory, "presentation/card.css"), '.local-card { display: grid; }');
  await writeFile(path.join(context.root, "src/应用/services/help.ts"), 'export interface HelpService { dismiss(): void; }');
  const manifest = { id: "local-card", slots: { children: { body: { capabilities: ["content"] }, headerActions: { capabilities: ["action"] } } } };
  await writeFile(path.join(context.root, directory, "manifest.json"), JSON.stringify(manifest));
  const inspection = { asset: { pluginId: "local-card", ownership: "project_source", definitionPath: definition, manifestPath: directory + "/manifest.json" }, manifest,
    instances: [{ id: "card-1", pluginId: "local-card" }], services: { provides: ["help.card"], optional: ["agent-ui.locale"] }, files: [], sharedTypes: { status: "available", symbols: [{ name: "UIPluginRenderProps" }] } };
  state.inspect.mockResolvedValue(inspection);
  const result = await inspectEditingContext(context, { pluginId: "local-card", sharedSymbols: ["UIPluginRenderProps"] });
  expect(result).toMatchObject({ status: "resolved", target: { entryPath: definition }, plugin: { manifest, implementationOwnership: "project", instances: inspection.instances, services: inspection.services },
    references: { publicApi: { status: "project_source" }, sharedTypes: inspection.sharedTypes }, coverage: { sourcesComplete: true } });
  const paths = "files" in result ? result.files!.map(file => file.path) : [];
  expect(paths).toEqual(expect.arrayContaining(["/" + definition, "/" + directory + "/manifest.json", "/" + directory + "/presentation/CardView.tsx", "/" + directory + "/presentation/card.css", "/src/应用/services/help.ts"]));
  expect(paths).not.toContain("/" + entry); // Never guesses index.tsx from a directory name.
  expect(state.inspect).toHaveBeenCalledWith(context.root, "inspect_ui_plugin", { pluginId: "local-card", sharedSymbols: ["UIPluginRenderProps"] }, context.signal);
  expect(context.authorizedPlugins.size).toBe(0);
});

it("resolves a custom Plugin by catalog search without application metadata", async () => {
  const context = await project();
  state.inspect.mockImplementation(async (_root, operation) => operation === "inspect_ui_project" ? {
    authoringTargetCatalog: { candidates: [{ id: "plugin-source:local-card", kind: "plugin_source", name: "帮助卡片", description: "帮助内容" }],
      bindings: [{ targetId: "plugin-source:local-card", pluginId: "local-card", definitionPath: "src/应用/plugins/composer/definition.ts" }] },
  } : { asset: { pluginId: "local-card", ownership: "project_source", definitionPath: "src/应用/plugins/composer/definition.ts", manifestPath: "src/应用/plugins/composer/manifest.json" } });
  expect(await inspectEditingContext(context, { query: "帮助卡片" })).toMatchObject({ status: "resolved", target: { pluginId: "local-card", entryPath: "src/应用/plugins/composer/definition.ts" } });
});

it("preserves npm-only official Plugin reference context without inventing an editable owner", async () => {
  const context = await project();
  const manifest = { id: "theme-switch", slots: {} }, services = { required: ["agent-ui.theme"] };
  state.inspect.mockResolvedValue({ asset: { pluginId: "theme-switch", ownership: "official_package", definitionPath: "source-registry/plugin/theme-switch/definition.ts" }, manifest, services, instances: [] });
  const result = await inspectEditingContext(context, { pluginId: "theme-switch" });
  expect(result).toMatchObject({ status: "navigation_unavailable", plugin: { manifest, services, ownership: "official_package" }, references: { publicApi: { status: "not_inspected" } } });
  expect(context.editingSelection).toBeUndefined(); expect(context.activity.before.size).toBe(0);
});

it("keeps continuations and freshness boundaries when a custom component has many dependencies", async () => {
  const context = await project(), directory = "src/应用/plugins/composer", definition = directory + "/definition.ts";
  for (let i = 0; i < 12; i++) await writeFile(path.join(context.root, directory, `part-${i}.ts`), `export const part${i} = ${i};`);
  await writeFile(path.join(context.root, definition), Array.from({ length: 12 }, (_, i) => `import { part${i} } from "./part-${i}.js";`).join("\n"));
  state.inspect.mockResolvedValue({ asset: { pluginId: "local-card", definitionPath: definition, manifestPath: directory + "/manifest.json" } });
  const result = await inspectEditingContext(context, { pluginId: "local-card" });
  expect(result).toMatchObject({ status: "resolved", coverage: { sourcesComplete: false, sourceReadCount: 8 } });
  if (!("coverage" in result)) throw new Error("missing source coverage");
  const pending = result.coverage!.fileNavigation.filter(item => item.status === "unread");
  expect(pending.length).toBeGreaterThan(0);
  for (const item of pending) { expect(item.nextRead?.tool).toBe("read_file"); expect(context.activity.observations.get(item.path!)).toBeUndefined(); }
});

it("does not follow comment/string lookalikes and handles reexports and dynamic literal imports", () => {
  expect(localModuleReferences('// import "./secret";\nconst text = \'import "./fake"\';\nexport { Card } from "./Card.js"; import "./card.css"; const lazy = import("./Lazy");'))
    .toEqual(["./Card.js", "./card.css", "./Lazy"]);
});

it("prefetches only a uniquely named current owner, without using a fixed task or mutation workflow", () => {
  const composer = { pluginId: "composer", name: "Composer", targetNames: ["输入框"], applicationPath: "/src/plugins/composer/index.tsx" };
  const custom = { pluginId: "company-card", name: "公司帮助卡片", targetNames: ["公司帮助卡片"], applicationPath: "/src/plugins/company-card/definition.ts" };
  const directory = { plugins: [composer, custom] };
  expect(requestedEditingPlugin({ readOnly: false, userMessage: "把输入框的占位提示改一下" }, directory)).toBe("composer");
  expect(requestedEditingPlugin({ readOnly: false, userMessage: "调整公司帮助卡片的样式" }, directory)).toBe("company-card");
  expect(requestedEditingPlugin({ readOnly: false, userMessage: "同时调整输入框和公司帮助卡片" }, directory)).toBeUndefined();
  expect(requestedEditingPlugin({ readOnly: true, userMessage: "输入框有哪些功能" }, directory)).toBeUndefined();
  expect(requestedEditingPlugin({ readOnly: false, userMessage: "新增不存在的业务插件" }, directory)).toBeUndefined();
  const theme = { pluginId: "theme-switch", name: "Theme Switch", targetNames: ["切换主题"], applicationPath: "/src/plugins/theme-switch/index.tsx" };
  expect(requestedEditingPlugin({ readOnly: false, userMessage: "给刚才的帮助卡片添加一个知道了按钮。切换主题后功能仍然正常。" }, { plugins: [composer, theme] })).toBeUndefined();
});

it.each(["definition", "manifest"])("rejects stale %s facts instead of mixing them with fresh source", async kind => {
  const context = await project(), inspection: any = await inspectResult(context.root);
  if (kind === "definition") inspection.definitionSource = { content: "old source", truncated: false };
  else inspection.manifest = { id: "old-id" };
  state.inspect.mockResolvedValue(inspection);
  await expect(inspectEditingContext(context, { pluginId: "composer" })).rejects.toThrow("EDITING_CONTEXT_STALE");
  for (const file of [entry, css, "src/应用/plugins/composer/definition.ts", "src/应用/plugins/composer/manifest.json"]) expect(context.activity.observations.get(file)).toBeUndefined();
});

it("does not read implementation/vendor imports or symlinked secrets while collecting context", async () => {
  const context = await project(), directory = "src/应用/plugins/composer", definition = directory + "/definition.ts";
  await mkdir(path.join(context.root, directory, "vendor"));
  await writeFile(path.join(context.root, directory, "vendor/private.ts"), 'export const value = "DO_NOT_READ";');
  await writeFile(path.join(context.root, definition), 'import "./vendor/private"; import "../../../../.env.local";');
  if (process.platform !== "win32") {
    await writeFile(path.join(context.root, ".env.local"), "SECRET_SENTINEL");
    await symlink(path.join(context.root, ".env.local"), path.join(context.root, directory, "secret.ts"));
    await writeFile(path.join(context.root, definition), (await readFile(path.join(context.root, definition), "utf8")) + 'import "./secret";');
  }
  state.inspect.mockResolvedValue({ asset: { pluginId: "local-card", definitionPath: definition } });
  const result = await inspectEditingContext(context, { pluginId: "local-card" });
  expect(result).toMatchObject({ coverage: { sourcesComplete: false } });
  expect(JSON.stringify(result)).not.toContain("SECRET_SENTINEL"); expect(JSON.stringify(result)).not.toContain("DO_NOT_READ");
  expect(context.activity.observations.get(directory + "/vendor/private.ts")).toBeUndefined();
});

it("supports working sets established by ordinary plugin inspection and read_file", async () => {
  const context = await project(), sessions = new EditingSessionStore();
  state.inspect.mockImplementation(() => inspectResult(context.root));
  await createTools(context);
  await context.hostTools!.get("inspect_ui_plugin")!({ pluginId: "composer" });
  await context.hostTools!.get("read_file")!({ file_path: entry });
  await sessions.remember(context);
  expect(await sessions.prepare(next(context))).toMatchObject({ status: "fresh", target: { entryPath: entry } });
  expect(state.inspect).toHaveBeenCalledTimes(1);
});

it("keeps the selected owner and its source closure while querying another Plugin's installed public types", async () => {
  const context = await project();
  state.inspect.mockImplementation(async (_root, _operation, input) => input.pluginId === "composer" ? inspectResult(context.root) : {
    asset: { pluginId: "reference", ownership: "project_source", definitionPath: "src/应用/plugins/reference/definition.ts" },
    application: { entryPath: "src/应用/plugins/reference/index.tsx", implementationOwnership: "npm" },
    sharedTypes: { module: "@za38.03/agent-ui-plugins", symbols: [{ name: "usePluginService", status: "available" }] },
  });
  const tools = await createTools(context);
  await inspectEditingContext(context, { pluginId: "composer" });
  const selection = context.editingSelection;
  const query = tools.find(tool => tool.name === "inspect_ui_plugin")!;
  const result = JSON.parse(await query.invoke({ pluginId: "reference", sharedSymbols: ["usePluginService"], sharedModule: "@za38.03/agent-ui-plugins" }));
  expect(result.ok).toBe(true); expect(result.result.sharedTypes.symbols[0].name).toBe("usePluginService");
  expect(context.editingSelection).toBe(selection);
  expect(context.pluginOwnerships!.get("reference")?.implementationOwnership).toBe("npm");
  expect(context.authorizedPlugins.size).toBe(0);
  // A deliberate owner inspection can still select a different target.
  await query.invoke({ pluginId: "reference" });
  expect(context.editingSelection?.target.pluginId).toBe("reference");
});

it("does not replace a resolved custom Plugin's component closure with metadata-only navigation on reinspection", async () => {
  const context = await project();
  const definition = "src/应用/plugins/composer/definition.ts", manifest = "src/应用/plugins/composer/manifest.json";
  await writeFile(path.join(context.root, definition), 'import { Composer } from "./index"; export default { Component: Composer };');
  state.inspect.mockImplementation(() => ({ asset: { pluginId: "composer", ownership: "project_source", definitionPath: definition, manifestPath: manifest },
    files: [{ path: css, kind: "file" }] }));
  await createTools(context);
  const result = await inspectEditingContext(context, { pluginId: "composer" });
  expect(result).toMatchObject({ editingPolicy: { projectEntryEdits: "editable within current user request" } });
  expect(context.editingSelection!.filePaths).toContain(entry);
  await context.hostTools!.get("inspect_ui_plugin")!({ pluginId: "composer" });
  expect(context.editingSelection!.filePaths).toContain(entry);
  expect(context.editingSelection!.filePaths).toContain(css);
});

it("keeps a bounded source range, rejects edits to unread lines and reuses the ordinary path protections", async () => {
  const context = await project(); passingValidation();
  await writeFile(path.join(context.root, entry), Array.from({ length: 200 }, (_, line) => `export const line${line} = ${line};`).join("\n"));
  state.inspect.mockImplementation(() => inspectResult(context.root));
  const result = await inspectEditingContext(context, { pluginId: "composer" });
  expect("files" in result && result.files?.[0]?.nextOffset).toBe(120);
  await createTools(context);
  await expect(context.hostTools!.get("edit_file_from_read")!({ file_path: entry, mode: "replace_lines", start_line: 150, replacement: "" })).rejects.toThrow("READ_RANGE_REQUIRED");
  for (const denied of ["C:\\Users\\test.ts", "../outside.ts", "/.env.local", "/node_modules/pkg/index.ts", "/.agent-ui/creator/logs/run.jsonl"]) expect(() => logicalProjectPath(denied)).toThrow("TOOL_PERMISSION_DENIED");
  if (process.platform !== "win32") { // Creating symlinks can require privileges on Windows.
    const outside = await project("outside");
    await symlink(path.join(outside.root, entry), path.join(context.root, "src/应用/outside.ts"));
    await expect(readProjectFile(context, { file_path: "src/应用/outside.ts" })).rejects.toThrow("TOOL_PERMISSION_DENIED");
  }
});

it("prefetches current source in a new run without replaying API, verification or grants", async () => {
  const context = await project(), sessions = new EditingSessionStore();
  state.inspect.mockImplementation(() => inspectResult(context.root));
  await inspectEditingContext(context, { pluginId: "composer" });
  context.authorizedPlugins.add("old-grant"); context.groups.add("plugin_authoring");
  await sessions.remember(context);
  const followup = next(context);
  const prepared = await sessions.prepare(followup);
  expect(prepared).toMatchObject({ status: "fresh", target: { entryPath: entry } });
  expect(followup.activity.observations.get(entry)?.exists).toBe(true);
  expect(followup.readRanges?.get(entry)?.[0]?.start).toBe(1);
  expect(followup.authorizedPlugins.size).toBe(0); expect(followup.groups.size).toBe(0);
  expect(prepared).not.toHaveProperty("references");
  expect(state.inspect).toHaveBeenCalledTimes(1);
  expect(await sessions.prepare({ ...next(context), threadId: "another" })).toBeUndefined();
  expect(await sessions.prepare(await project())).toBeUndefined();
});

it.each(["source", "owner", "package", "installed-catalog"])("invalidates a working set when %s changes externally", async kind => {
  const context = await project(), sessions = new EditingSessionStore();
  const packageRoot = path.join(context.root, "node_modules/@za38.03/agent-ui-plugins");
  if (kind === "installed-catalog") {
    await mkdir(packageRoot, { recursive: true });
    await writeFile(path.join(packageRoot, "package.json"), '{"name":"@za38.03/agent-ui-plugins","exports":{"./catalog.json":"./catalog.json"}}');
    await writeFile(path.join(packageRoot, "catalog.json"), '{"version":"same"}');
  }
  state.inspect.mockImplementation(() => inspectResult(context.root));
  await inspectEditingContext(context, { pluginId: "composer" }); await sessions.remember(context);
  const changed = kind === "source" ? path.join(context.root, entry) : kind === "owner" ? path.join(context.root, "src/应用/plugins/composer/definition.ts")
    : kind === "package" ? path.join(context.root, "package.json") : path.join(packageRoot, "catalog.json");
  await writeFile(changed, kind === "package" ? '{"name":"edit-host","dependencies":{"different":"1"}}' : "external edit");
  const followup = next(context);
  expect(await sessions.prepare(followup)).toMatchObject({ status: "stale" });
  expect(followup.editingSelection).toBeUndefined(); expect(followup.activity.observations.get(entry)).toBeUndefined();
  expect(await sessions.prepare(next(context))).toBeUndefined();
});

it("expires navigation and does not save a source conflict after a successful tool read", async () => {
  const context = await project(); let now = 0;
  const sessions = new EditingSessionStore(() => now, 1000);
  state.inspect.mockImplementation(() => inspectResult(context.root));
  await inspectEditingContext(context, { pluginId: "composer" }); await sessions.remember(context);
  now = 1001;
  expect(await sessions.prepare(next(context))).toMatchObject({ status: "stale", reason: "expired" });
  await writeFile(path.join(context.root, entry), "external");
  await sessions.remember(context);
  expect(await sessions.prepare(next(context))).toBeUndefined();
});

it("bounds the number of sessions and drops focus after an edit outside the selected working set", async () => {
  const context = await project(), sessions = new EditingSessionStore(Date.now, 60_000, 2);
  state.inspect.mockImplementation(() => inspectResult(context.root));
  await inspectEditingContext(context, { pluginId: "composer" });
  for (const threadId of ["oldest", "second", "third"]) await sessions.remember({ ...context, threadId });
  expect(await sessions.prepare({ ...next(context), threadId: "oldest" })).toBeUndefined();
  const followup = { ...next(context), threadId: "third" };
  expect(await sessions.prepare(followup)).toMatchObject({ status: "fresh" });
  followup.activity.after.set("src/应用/unrelated.ts", { exists: true, hash: "other", content: "other" });
  await sessions.remember(followup);
  expect(await sessions.prepare({ ...next(context), threadId: "third" })).toBeUndefined();
});

it("prefetches the edited region instead of returning only the beginning of a long file", async () => {
  const context = await project(), sessions = new EditingSessionStore(); passingValidation();
  const longSource = Array.from({ length: 220 }, (_, index) => `export const value${index} = ${index};`).join("\n");
  await writeFile(path.join(context.root, entry), longSource);
  state.inspect.mockImplementation(() => inspectResult(context.root));
  await createTools(context); await inspectEditingContext(context, { pluginId: "composer" });
  await readProjectFile(context, { file_path: entry, offset: 149, limit: 1 });
  await context.hostTools!.get("edit_file_from_read")!({ file_path: entry, mode: "replace_lines", start_line: 150, replacement: "export const value149 = 999;\n" });
  await sessions.remember(context);
  const prepared = await sessions.prepare(next(context));
  expect(prepared).toMatchObject({ status: "fresh" });
  expect("files" in prepared! && prepared.files?.[0]?.content).toContain("150: export const value149 = 999;");
});

class ScriptedModel extends BaseChatModel {
  calls = 0;
  bound: string[][] = [];
  constructor(readonly answer: (index: number, messages: BaseMessage[]) => AIMessage) { super({}); }
  _llmType() { return "creator-edit-context-regression"; }
  bindTools(tools: any[]) { this.bound.push(tools.map(tool => tool.name)); return this; }
  async _generate(messages: BaseMessage[]) {
    let message = this.answer(this.calls++, messages);
    // Existing scripts describe ordinary edits. Supply the classifier's new
    // structured field only for inventory-aware routing, never execution calls.
    if (JSON.stringify(messages).includes('"projectPlugins"') || JSON.stringify(messages).includes('\\"projectPlugins\\"')) {
      try {
        const value = JSON.parse(String(message.content));
        if (value.permission && !value.removalTarget) message = new AIMessage(JSON.stringify({ ...value, removalTarget: { status: "not_requested", description: "", pluginIds: [] } }));
      } catch { /* Native tool calls and prose are not routing JSON. */ }
    }
    return { generations: [{ text: "", message }] };
  }
}
const call = (name: string, args: object, id: string) => new AIMessage({ content: "", tool_calls: [{ name, args, id, type: "tool_call" }] });

function directoryFixture() {
  return { view: "composition", sourceRoot: "src/应用", capabilityCatalogRevision: "catalog-1",
    appUIModel: { hash: "a".repeat(64), layout: { nodeRef: "root", type: "row", children: [{ nodeRef: "history-slot", type: "slot" }] } },
    capabilitySummaries: [
      { pluginId: "composer", name: "输入框", description: "输入并发送消息", authoring: { intents: ["改输入提示"], visualRole: "消息输入", defaultPlacement: { type: "layout_slot" } }, componentPresentation: { packageVersion: "3.2.1", module: "@za38.03/agent-ui-plugins/composer", component: "Composer", facts: { presentation: "Field differs from containing surface" } }, publicApi: { forbidden: "full-api" } },
      { pluginId: "history", name: "会话历史", description: "翻看之前聊过什么", authoring: { intents: ["查看聊天记录"] } },
      { pluginId: "dictation", name: "语音输入", description: "说话转成输入文字" },
    ],
    pluginSources: [{ pluginId: "composer", status: "available" }, { pluginId: "missing", status: "missing" }],
    pluginInstances: [{ id: "input", pluginId: "composer", enabled: true, effectiveEnabled: false, target: { type: "plugin_slot", parentInstanceId: "surface", slot: "composer" }, index: 0 },
      { id: "history-1", pluginId: "history", enabled: true, effectiveEnabled: true, target: { type: "layout_slot", slotRef: "history-slot" }, index: 0 },
      { id: "missing-1", pluginId: "missing", enabled: false, effectiveEnabled: false, target: { type: "application" }, index: 0 }],
    authoringTargetCatalog: { candidates: [{ id: "welcome", kind: "application_config", name: "欢迎内容", description: "开场问题", intents: ["修改推荐问题"], relatedPluginIds: ["composer"] }],
      bindings: [{ kind: "plugin_source", targetId: "plugin-source:composer", pluginId: "composer", ownerPath: entry.replaceAll("/", "\\") },
        { kind: "application_config", targetId: "welcome", ownerPath: "src/应用/conversation/config/welcome.ts" }] },
    rawSource: "do not inject implementation source",
  };
}

it("projects every project Plugin, effective state, owner and relative position without injecting source or API", () => {
  const directory = projectPluginDirectory(directoryFixture());
  expect(directory.plugins).toHaveLength(4);
  expect(directory.counts).toEqual({ total: 4, composed: 3, enabled: 1, disabled: 2, notComposed: 1, instances: 3 });
  expect(directory.plugins.find(item => item.pluginId === "composer")).toMatchObject({ name: "输入框", description: "输入并发送消息", state: "disabled", applicationPath: "/" + entry, intents: ["改输入提示"] });
  expect(directory.plugins.find(item => item.pluginId === "composer")).toMatchObject({ componentPresentation: { packageVersion: "3.2.1", facts: { presentation: "Field differs from containing surface" } } });
  expect(directory.plugins.find(item => item.pluginId === "history")).toMatchObject({ state: "enabled", instances: [{ id: "history-1", layout: { parentNodeRef: "root", parentType: "row", index: 0 } }] });
  expect(directory.plugins.find(item => item.pluginId === "dictation")).toMatchObject({ state: "not_composed", instances: [] });
  expect(directory.plugins.find(item => item.pluginId === "missing")).toMatchObject({ sourceStatus: "missing" });
  expect(directory.applicationTargets[0]).toMatchObject({ id: "welcome", path: "/src/应用/conversation/config/welcome.ts" });
  expect(JSON.stringify(directory)).not.toContain("full-api");
  expect(JSON.stringify(directory)).not.toContain("do not inject implementation source");
});

it("preloads the directory through the shared inspection without reading source or granting mutation authority", async () => {
  const context = await project(); context.readOnly = true;
  state.inspect.mockResolvedValue(directoryFixture());
  const directory = await preparePluginDirectory(context);
  expect(directory.status).toBe("available");
  await inspectProject(context, { view: "composition" });
  expect(state.inspect).toHaveBeenCalledTimes(1);
  expect(context.activity.observations.get(entry)).toBeUndefined();
  expect(context.readRanges?.size ?? 0).toBe(0);
  expect(context.authorizedPlugins.size).toBe(0);
  expect(context.activity.validations).toEqual([]);
  expect(visibleTool("mutate_app_ui_model", context)).toBe(false);
});

it("adds existing localized UI names only to Plugin identities in the current project", () => {
  const fixture = directoryFixture();
  fixture.capabilitySummaries = [{ pluginId: "conversation-thread-list", name: "History", targetNames: ["客户会话"] },
    { pluginId: "customer-history", name: "Custom history" }] as any;
  fixture.pluginInstances = []; fixture.pluginSources = [];
  const directory = projectPluginDirectory(fixture);
  expect(directory.plugins).toHaveLength(2);
  const history = directory.plugins[0]!;
  expect(history.targetNames).toEqual(expect.arrayContaining(["客户会话", "会话历史", "查找与切换会话"]));
  expect(namesRequestedPlugins("把查找与切换会话的入口隐藏，源码保留。", [history])).toBe(true);
  expect(directory.plugins[1]!.targetNames).not.toContain("查找与切换会话");
  expect(directory.plugins.some(plugin => plugin.pluginId === "dictation-action")).toBe(false);
});

it("includes the actual parent track size when locating a Plugin in a fixed layout region", () => {
  const fixture = directoryFixture();
  Object.assign(fixture.appUIModel.layout, { type: "column", sizes: ["52px"] });
  const directory = projectPluginDirectory(fixture);
  expect(directory.plugins.find(item => item.pluginId === "history")?.instances[0]?.layout).toMatchObject({ parentType: "column", parentTrackSize: "52px", index: 0 });
});

it("retains exact instance and layout configuration for ambiguous unwanted or explicitly hidden Plugins", () => {
  const fixture = directoryFixture(), input = { appUIModelHash: "a".repeat(64), operations: [{ type: "remove_plugin", instanceId: "history-1" }] };
  for (const request of ["会话历史这个插件不要了。", "把会话历史去掉，其他功能保留。", "不要那个会话历史入口。", "只隐藏会话历史入口，源码不要删除。", "关掉会话历史，不删除源码。", "Hide chat history; do not delete its code.", "I don't want chat history anymore."]) {
    try { assertInstanceRetention(request, input, fixture); throw new Error("expected guard"); }
    catch (error: any) {
      expect(error.code).toBe("CREATOR_PLUGIN_INSTANCE_RETENTION_REQUIRED");
      expect(error.recovery).toEqual({ appUIModelHash: input.appUIModelHash, operations: [{ type: "set_plugin_enabled", instanceId: "history-1", enabled: false }] });
    }
  }
  expect(() => assertInstanceRetention("会话历史不要了", { operations: [{ type: "remove_layout_node", nodeRef: "history-slot" }] }, fixture)).toThrow("CREATOR_PLUGIN_INSTANCE_RETENTION_REQUIRED");
  expect(() => assertInstanceRetention("会话历史不要了", { operations: [{ type: "set_plugin_enabled", instanceId: "history-1", enabled: false }] }, fixture)).not.toThrow();
});

it("preserves explicit instance removal, replacement and general non-removal authoring", () => {
  const input = { operations: [{ type: "remove_plugin", instanceId: "history-1" }] };
  for (const request of ["从组合中移除会话历史实例，源码保留。", "会话历史不要了，直接移除这个实例。", "Remove the chat history instance.", "把会话历史替换成自定义历史。"]) {
    expect(() => assertInstanceRetention(request, input, directoryFixture())).not.toThrow();
  }
  expect(() => assertInstanceRetention("重新组织侧栏布局", input, directoryFixture())).not.toThrow();
});

it("does not use removal of another Plugin as authority to delete a hidden instance", () => {
  const fixture = { capabilitySummaries: [{ pluginId: "conversation-thread-list" }, { pluginId: "dictation-action" }],
    pluginInstances: [{ id: "history", pluginId: "conversation-thread-list" }, { id: "voice", pluginId: "dictation-action" }] };
  const request = "只隐藏会话历史，移除语音输入实例。";
  expect(() => assertInstanceRetention(request, { operations: [{ type: "remove_plugin", instanceId: "history" }] }, fixture)).toThrow("CREATOR_PLUGIN_INSTANCE_RETENTION_REQUIRED");
  expect(() => assertInstanceRetention(request, { operations: [{ type: "remove_plugin", instanceId: "voice" }] }, fixture)).not.toThrow();
});

it("keeps composition unchanged until permanent source deletion receives its own confirmation", async () => {
  const context = await project(); passingValidation();
  const fixture = directoryFixture(); fixture.appUIModel.layout.children[0]!.nodeRef = "l4";
  fixture.pluginInstances[1]!.target = { type: "layout_slot", slotRef: "l4" };
  state.inspect.mockResolvedValue(fixture);
  context.removalTarget = { status: "resolved", description: "会话历史", pluginIds: ["history"] };
  context.userMessage = "把会话历史插件连同源码永久删除。";
  const tools = await createTools(context), mutation = tools.find(tool => tool.name === "mutate_app_ui_model")!;
  for (const op of [{ type: "remove_plugin", instanceId: "history-1" }, { type: "set_plugin_enabled", instanceId: "history-1", enabled: false }, { type: "remove_layout_node", nodeRef: "l4" }]) {
    const result = JSON.parse(await mutation.invoke({ appUIModelHash: "a".repeat(64), operations: [op] }));
    expect(result).toMatchObject({ ok: false, error: { code: "CREATOR_PLUGIN_PURGE_CONFIRMATION_REQUIRED", recovery: { tool: "purge_ui_plugin", pluginIds: ["history"] } } });
  }
  expect(state.inspect.mock.calls.some(([, name]) => name === "mutate_app_ui_model")).toBe(false);
  expect(context.activity.revision).toBe(0);
  expect(context.noChangeOutcome).toBeUndefined();
});

it("rejects structural deletion before Operator mutation and returns an actionable disable alternative", async () => {
  const context = await project(); passingValidation(); state.inspect.mockResolvedValue(directoryFixture());
  context.removalTarget = { status: "resolved", description: "会话历史", pluginIds: ["history"] };
  context.userMessage = "会话历史这个插件不要了。";
  const tools = await createTools(context), mutation = tools.find(tool => tool.name === "mutate_app_ui_model")!;
  const result = JSON.parse(await mutation.invoke({ appUIModelHash: "a".repeat(64), operations: [{ type: "remove_plugin", instanceId: "history-1" }] }));
  expect(result).toMatchObject({ ok: false, error: { code: "CREATOR_PLUGIN_INSTANCE_RETENTION_REQUIRED", recovery: { operations: [{ type: "set_plugin_enabled", instanceId: "history-1", enabled: false }] } } });
  expect(state.inspect.mock.calls.some(([, name]) => name === "mutate_app_ui_model")).toBe(false);
  expect(context.noChangeOutcome).toBeUndefined();
  expect(context.activity.revision).toBe(0);
});

it("refreshes first-call Plugin facts in each run rather than replaying old enablement", async () => {
  const context = await project();
  state.inspect.mockResolvedValueOnce(directoryFixture());
  expect((await preparePluginDirectory(context) as any).plugins.find((item: any) => item.pluginId === "history").state).toBe("enabled");
  const updated = directoryFixture(); updated.pluginInstances[1]!.enabled = false; updated.pluginInstances[1]!.effectiveEnabled = false;
  state.inspect.mockResolvedValueOnce(updated);
  expect((await preparePluginDirectory(next(context)) as any).plugins.find((item: any) => item.pluginId === "history").state).toBe("disabled");
  expect(state.inspect).toHaveBeenCalledTimes(2);
});

it("provides Plugin metadata before the first execution model call while keeping permission classification separate", async () => {
  const context = await project(); passingValidation(); state.inspect.mockResolvedValue(directoryFixture());
  state.model = new ScriptedModel((index, messages) => {
    if (index === 0) { expect(JSON.stringify(messages)).toContain("projectPlugins"); expect(JSON.stringify(messages)).not.toContain("applicationPath"); return new AIMessage('{"permission":"domain_write"}'); }
    if (index === 1) {
      const input = JSON.stringify(messages);
      expect(input).toContain("pluginDirectory"); expect(input).toContain("翻看之前聊过什么");
      expect(input).toContain("语音输入"); expect(input).toContain("not_composed"); expect(input).toContain(entry);
      return call("read_file", { file_path: entry }, "read-owner");
    }
    return index === 2 ? call("edit_file", { file_path: entry, old_string: "48", new_string: "56" }, "edit-owner") : new AIMessage("done");
  });
  const runtime = new CreatorAgentRuntime(context.root, context.skills, contracts), events: any[] = [];
  await runtime.run({ threadId: "directory", runId: "directory-1", messages: [{ role: "user", content: "把输入框加高一点" }] }, context.signal, async event => { events.push(event); });
  expect(events.at(-1)?.result.completion).toBe("success");
  expect(events.filter(event => event.type === "TOOL_CALL_START").map(event => event.toolCallName)).toEqual(["read_file", "edit_file"]);
  expect(state.inspect.mock.calls.map(([, operation]) => operation)).toEqual(["inspect_ui_project", "inspect_ui_plugin"]);
});

it("prefetches a uniquely named Plugin's fresh source and API before execution without another model round", async () => {
  const context = await project(); passingValidation();
  state.inspect.mockImplementation(async (_root, operation) => operation === "inspect_ui_plugin" ? inspectResult(context.root) : directoryFixture());
  state.model = new ScriptedModel((index, messages) => {
    if (index === 0) return new AIMessage('{"permission":"domain_write"}');
    if (index === 1) {
      const data = JSON.stringify(messages);
      expect(data).toContain("editingContext"); expect(data).toContain("publicApi"); expect(data).toContain("inputProps"); expect(data).toContain("minHeight: 48");
      return call("edit_file_from_read", { file_path: entry, mode: "replace_lines", start_line: 1, replacement: original.replace("48", "56") }, "edit-prefetched");
    }
    if (index === 2) return call("validate_creator_changes", { includeBuild: false }, "validate-prefetched");
    return new AIMessage("Updated the input height and validated the changes.");
  });
  const runtime = new CreatorAgentRuntime(context.root, context.skills, contracts), events: any[] = [];
  await runtime.run({ threadId: "prefetch", runId: "prefetch-1", messages: [{ role: "user", content: "把输入框加高一点" }] }, context.signal, async event => { events.push(event); });
  expect(events.filter(event => event.type === "TOOL_CALL_START").map(event => event.toolCallName)).toEqual(["edit_file_from_read", "validate_creator_changes"]);
  expect(await readFile(path.join(context.root, entry), "utf8")).toContain("minHeight: 56");
  expect(events.at(-1)?.result.completion).toBe("success");
  expect(state.model.calls).toBe(4);
});

it("keeps general file inspection usable when project Plugin discovery is unavailable", async () => {
  const context = await project(); state.inspect.mockRejectedValue(new Error("OPERATOR_OFFLINE"));
  state.model = new ScriptedModel((index, messages) => {
    if (index === 0) { expect(JSON.stringify(messages)).toContain('\\"status\\":\\"unavailable\\"'); return call("read_file", { file_path: entry }, "fallback-read"); }
    return new AIMessage("read only");
  });
  const runtime = new CreatorAgentRuntime(context.root, context.skills, contracts), events: any[] = [];
  await runtime.run({ threadId: "fallback", runId: "fallback-1", messages: [{ role: "user", content: "只读检查文件" }] }, context.signal, async event => { events.push(event); });
  expect(events.at(-1)?.result.completion).toBe("success");
  expect(events.some(event => event.toolCallName === "read_file")).toBe(true);
});

it("ends a cancelled purge without another model call, mutation, or confirmation", async () => {
  const context = await project(); passingValidation(); state.inspect.mockResolvedValue(directoryFixture());
  state.model = new ScriptedModel(index => [
    new AIMessage(JSON.stringify({ permission: "domain_write", removalTarget: { status: "resolved", description: "聊天历史", pluginIds: ["history"] } })),
    call("purge_ui_plugin", { pluginId: "history", appUIModelHash: "a".repeat(64), sourceStateHash: "b".repeat(64) }, "purge"),
    call("mutate_app_ui_model", { appUIModelHash: "a".repeat(64), operations: [{ type: "remove_plugin", instanceId: "history-instance" }] }, "must-not-run"),
  ][index]!);
  const runtime = new CreatorAgentRuntime(context.root, context.skills, contracts), events: any[] = [];
  const publish = async (event: any) => { events.push(event); };
  await runtime.run({ threadId: "cancel-purge", runId: "purge-1", messages: [{ role: "user", content: "把会话历史连同源码删除" }] }, context.signal, publish);
  const pending = events.find(event => event.name === "on_interrupt").value;
  await runtime.run({ threadId: "cancel-purge", runId: "purge-2", messages: [], forwardedProps: { command: { resume: { interruptId: pending.id, answers: { "plugin-removal": ["cancel"] } } } } }, context.signal, publish);
  expect(state.model.calls).toBe(2);
  expect(runtime.pending.size).toBe(0);
  expect(state.inspect.mock.calls.every(([, operation]) => !["purge_ui_plugin", "mutate_app_ui_model"].includes(operation))).toBe(true);
  expect(events.at(-1)).toMatchObject({ type: "RUN_FINISHED", result: { completion: "success", noChangeOutcome: { status: "user_cancelled" }, receipt: { files: [] } } });
  const output = events.filter(event => event.type === "TEXT_MESSAGE_CONTENT").map(event => event.delta).join("");
  expect(output).toContain("已取消"); expect(output).not.toContain("Host 拒绝");
  const toolResult = events.find(event => event.type === "TOOL_CALL_RESULT" && String(event.content).includes("user_cancelled"));
  expect(JSON.parse(toolResult.content).result).toMatchObject({ status: "declined", reason: "user_cancelled", retryable: false });
  // Cancellation is request-local: the next explicit request gets fresh authority.
  state.model = new ScriptedModel(index => index === 0 ? call("read_file", { file_path: entry }, "new-read") : new AIMessage("checked"));
  await runtime.run({ threadId: "cancel-purge", runId: "purge-3", messages: [{ role: "user", content: "只读检查输入框文件" }] }, context.signal, publish);
  expect(events.at(-1).result.completion).toBe("success"); expect(state.model.calls).toBe(2);
  state.model = new ScriptedModel(index => [new AIMessage('{"permission":"domain_write"}'),
    call("read_file", { file_path: entry }, "fresh-read"),
    call("edit_file", { file_path: entry, old_string: "48", new_string: "56" }, "fresh-edit"), new AIMessage("changed"),
  ][index]!);
  await runtime.run({ threadId: "cancel-purge", runId: "purge-4", messages: [{ role: "user", content: "改主意了，把输入框高度改成56" }] }, context.signal, publish);
  expect(events.at(-1).result.completion).toBe("success");
  expect(await readFile(path.join(context.root, entry), "utf8")).toContain("minHeight: 56");
});

it.each([
  { request: "加一个中英文切换按钮。", route: "unresolved", hideAttachment: false },
  { request: "就是一个能把界面在中文和英文之间切换的按钮，放在聊天区右上角就行。", route: "resolved", hideAttachment: false },
  { request: "加一个中英文切换按钮，并隐藏附件入口。", route: "resolved", hideAttachment: true },
])("executes additions despite an irrelevant removal route: $request", async ({ request, route, hideAttachment }) => {
  const context = await project(); passingValidation();
  const fixture = directoryFixture() as any;
  fixture.capabilitySummaries.push({ pluginId: "locale-switch", name: "Locale Switch" }, { pluginId: "add-attachment-action", name: "Attachment" });
  fixture.pluginInstances.push({ id: "attachment", pluginId: "add-attachment-action", enabled: true });
  const modelPath = "src/应用/app-ui/app-ui.json";
  await mkdir(path.dirname(path.join(context.root, modelPath)), { recursive: true });
  await writeFile(path.join(context.root, modelPath), JSON.stringify(fixture.pluginInstances));
  const operations = [{ type: "insert_plugin_default", plugin: { pluginId: "locale-switch" } },
    ...(hideAttachment ? [{ type: "set_plugin_enabled", instanceId: "attachment", enabled: false }] : [])];
  state.inspect.mockImplementation(async (_root, operation, input) => {
    if (operation === "mutate_app_ui_model") {
      expect(input.operations).toEqual(operations);
      fixture.pluginInstances.push({ id: "locale", pluginId: "locale-switch", enabled: true });
      if (hideAttachment) fixture.pluginInstances.find((item: any) => item.id === "attachment").enabled = false;
      await writeFile(path.join(context.root, modelPath), JSON.stringify(fixture.pluginInstances));
      return { changed: true, changedPaths: [modelPath] };
    }
    expect(operation).toBe("inspect_ui_project");
    return fixture;
  });
  state.model = new ScriptedModel(index => [
    new AIMessage(JSON.stringify({ permission: "domain_write", removalTarget: { status: route, description: "中英文切换", pluginIds: route === "resolved" ? ["locale-switch"] : [] } })),
    call("mutate_app_ui_model", { appUIModelHash: "a".repeat(64), operations }, "add-locale"),
    new AIMessage("Added the language control."),
  ][index]!);
  const runtime = new CreatorAgentRuntime(context.root, context.skills, contracts), events: any[] = [];
  await runtime.run({ threadId: "add-locale", runId: "add-locale-1", messages: [{ role: "user", content: request }] }, context.signal, async event => { events.push(event); });
  const saved = JSON.parse(await readFile(path.join(context.root, modelPath), "utf8"));
  expect(saved).toContainEqual({ id: "locale", pluginId: "locale-switch", enabled: true });
  expect(saved.find((item: any) => item.id === "attachment").enabled).toBe(!hideAttachment);
  expect(events.at(-1).result).toMatchObject({ completion: "success", receipt: { verification: { status: "changed-and-statically-verified" } } });
  expect(state.inspect.mock.calls.filter(([, operation]) => operation === "mutate_app_ui_model")).toHaveLength(1);
  expect(state.model.calls).toBe(3);
});

it("recognizes a requested 去掉 without treating its negation or an addition as removal", () => {
  const attachment = [{ pluginId: "add-attachment-action" }];
  const copy = [{ pluginId: "copy-action" }];
  expect(namesRequestedRemoval("先把输入框里的添加附件按钮去掉，其他功能保留。", attachment)).toBe(true);
  expect(namesRequestedRemoval("不要去掉附件按钮，去掉复制按钮。", attachment)).toBe(false);
  expect(namesRequestedRemoval("不要去掉附件按钮，去掉复制按钮。", copy)).toBe(true);
  expect(namesRequestedRemoval("增加附件按钮。", attachment)).toBe(false);
});

it("permits inspection but blocks an unresolved removal before execution or confirmation", async () => {
  const context = await project(); passingValidation(); state.inspect.mockResolvedValue(directoryFixture());
  state.model = new ScriptedModel(index => index === 0
    ? new AIMessage(JSON.stringify({ permission: "domain_write", removalTarget: { status: "unresolved", description: "绘画历史面板", pluginIds: [] } }))
    : index === 1 ? call("read_file", { file_path: "/" + entry }, "inspect-first")
    : new AIMessage({ content: "我先移除历史面板。", tool_calls: [{ name: "purge_ui_plugin", args: { pluginId: "history", appUIModelHash: "a".repeat(64), sourceStateHash: "b".repeat(64) }, id: "wrong-target", type: "tool_call" }] }));
  const runtime = new CreatorAgentRuntime(context.root, context.skills, contracts), events: any[] = [];
  await runtime.run({ threadId: "unknown", runId: "unknown-1", messages: [{ role: "user", content: "不要那个绘画历史面板" }] }, context.signal, async event => { events.push(event); });
  expect(state.model.calls).toBe(3);
  expect(events.filter(event => event.type === "TOOL_CALL_START").map(event => event.toolCallName)).toEqual(["read_file", "purge_ui_plugin"]);
  expect(events.some(event => event.name === "on_interrupt")).toBe(false);
  expect(state.inspect.mock.calls.some(([, name]) => name === "purge_ui_plugin")).toBe(false);
  expect(events.at(-1).result).toMatchObject({ completion: "success", noChangeOutcome: { status: "needs_target_clarification" }, receipt: { files: [] } });
  expect(events.filter(event => event.type === "TEXT_MESSAGE_CONTENT").map(event => event.delta).join("")).toContain("绘画历史面板");
  expect(events.filter(event => event.type === "TEXT_MESSAGE_CONTENT").at(-1)?.delta).toContain("你指的是哪个功能或界面位置");
  expect(await readFile(path.join(context.root, entry), "utf8")).toBe(original);
});

it("enforces terminal decisions at direct Host tool entry points too", async () => {
  const context = await project(); passingValidation(); await createTools(context);
  cancelExecution(context, "purge_ui_plugin");
  await expect(Promise.resolve().then(() => context.hostTools!.get("create_ui_source_file")!({ path: "/src/probe.ts", content: "changed" }))).rejects.toThrow("CREATOR_REQUEST_DECISION_FINAL");
  expect(context.validation!.ensureBaseline).not.toHaveBeenCalled();
});

it("independently rejects a router substitution using the latest request rather than its inferred description", async () => {
  const context = await project(); passingValidation(); state.inspect.mockResolvedValue(directoryFixture());
  state.model = new ScriptedModel(index => {
    if (index === 1) return call("purge_ui_plugin", { pluginId: "history", appUIModelHash: "a".repeat(64), sourceStateHash: "b".repeat(64) }, "substituted-target");
    expect(index).toBe(0);
    return new AIMessage(JSON.stringify({ permission: "domain_write", removalTarget: { status: "resolved", description: "聊天历史面板", pluginIds: ["history"] } }));
  });
  const runtime = new CreatorAgentRuntime(context.root, context.skills, contracts), events: any[] = [];
  await runtime.run({ threadId: "wrong-inference", runId: "wrong-inference-1", messages: [{ role: "user", content: "以前画图的历史面板我不想要了" }] }, context.signal, async event => { events.push(event); });
  expect(state.model.calls).toBe(2);
  expect(state.inspect.mock.calls.some(([, name]) => name === "purge_ui_plugin")).toBe(false);
  expect(events.some(event => event.name === "on_interrupt")).toBe(false);
  expect(events.at(-1).result.noChangeOutcome.status).toBe("needs_target_clarification");
});

it("rejects forged removal identities, including a layout containing an unrelated Plugin", () => {
  const target = parseRemovalTarget({ status: "resolved", description: "聊天历史", pluginIds: ["history"] }, [{ pluginId: "history" }]);
  expect(() => parseRemovalTarget({ ...target, pluginIds: ["invented"] }, [{ pluginId: "history" }])).toThrow("CREATOR_REQUEST_ROUTE_INVALID");
  expect(() => assertRemovalScope(target, "purge_ui_plugin", { pluginId: "composer" }, undefined)).toThrow("CREATOR_REMOVAL_TARGET_MISMATCH");
  const fixture = directoryFixture();
  expect(() => assertRemovalScope(target, "mutate_app_ui_model", { operations: [{ type: "set_plugin_enabled", instanceId: "input", enabled: false }] }, fixture)).toThrow("CREATOR_REMOVAL_TARGET_MISMATCH");
  expect(() => assertRemovalScope(target, "mutate_app_ui_model", { operations: [{ type: "remove_layout_node", nodeRef: "root" }] }, { ...fixture, pluginInstances: [{ id: "input", pluginId: "composer", target: { type: "layout_slot", slotRef: "history-slot" } }] })).toThrow("CREATOR_REMOVAL_TARGET_MISMATCH");
});

it("keeps the grounded visible target when the router also selects unnamed backing services", async () => {
  const context = await project();
  const plugins = ["conversation-thread-list", "conversation-data-source", "conversation-service"].map(pluginId => ({ pluginId, instances: [] }));
  state.model = new ScriptedModel(() => new AIMessage(JSON.stringify({ permission: "domain_write", removalTarget: {
    status: "resolved", description: "会话历史", pluginIds: plugins.map(item => item.pluginId),
  } })));
  const runtime = new CreatorAgentRuntime(context.root, context.skills, contracts);
  const policy = await (runtime as any).classify([{ role: "user", content: "会话历史这个插件不要了。" }], "grounded-service", context.signal, { status: "available", plugins });
  expect(policy).toEqual({ readOnly: false, removalTarget: { status: "resolved", description: "会话历史", pluginIds: ["conversation-thread-list"] } });
  expect(() => assertRemovalScope(policy.removalTarget, "purge_ui_plugin", { pluginId: "conversation-service" }, undefined)).toThrow("CREATOR_REMOVAL_TARGET_MISMATCH");
  const unknown = await (runtime as any).classify([{ role: "user", content: "不要那个自动翻译会话内容的浮窗。" }], "unknown-service", context.signal, { status: "available", plugins });
  expect(unknown.removalTarget).toMatchObject({ status: "unresolved", pluginIds: [] });
});

it("grounds complete feature names, source preservation and bare references without dropping new qualifiers", () => {
  const plugins = [{ pluginId: "conversation-thread-list", name: "Conversation Thread List" }];
  for (const request of ["改主意了，现在只隐藏聊天历史入口，不删除任何源码。", "还是先停用聊天历史入口吧，只隐藏按钮，所有代码都保留。", "把聊天历史入口隐藏并保留源码", "把conversation-thread-list隐藏"]) expect(namesRequestedPlugins(request, plugins)).toBe(true);
  for (const request of ["以前画图的历史面板我不想要了。", "不要那个绘画历史面板", "不要绘画历史，保留聊天历史", "不要隐藏聊天历史", "删除conversation-thread-list-custom"]) expect(namesRequestedPlugins(request, plugins)).toBe(false);
  expect(namesRequestedPlugins("刚才那个插件我不想要了。", plugins, [{ user: "聊天历史入口对应什么插件？", assistant: "conversation-thread-list" }])).toBe(true);
  expect(namesRequestedPlugins("那个绘画历史面板不要了。", plugins, [{ user: "聊天历史是什么插件？" }])).toBe(false);
});

it("matches locale descriptions without treating an addition as removal authority", () => {
  const locale = { pluginId: "locale-switch", name: "Locale Switch" }, attachment = { pluginId: "add-attachment-action" };
  for (const request of ["加一个中英文切换按钮。", "就是一个能把界面在中文和英文之间切换的按钮，放在聊天区右上角就行。", "加一个中英切换按钮"]) {
    expect(namesRequestedPlugins(request, [locale])).toBe(true);
    expect(namesRequestedRemoval(request, [locale])).toBe(false);
  }
  expect(namesRequestedRemoval("加一个中英文切换按钮，并隐藏附件入口。", [attachment])).toBe(true);
  expect(namesRequestedRemoval("加一个中英文切换按钮，并隐藏附件入口。", [locale])).toBe(false);
  expect(namesRequestedRemoval("隐藏中英文切换按钮", [locale])).toBe(true);
  expect(namesRequestedRemoval("不要隐藏中英文切换按钮", [locale])).toBe(false);
  expect(namesRequestedRemoval("Add a language switch and hide attachment", [attachment])).toBe(true);
  expect(namesRequestedRemoval("Add a language switch and hide attachment", [locale])).toBe(false);
});

it("does not use a named addition as authority to hide that same Plugin", async () => {
  const context = await project(); passingValidation();
  const fixture = directoryFixture() as any;
  fixture.capabilitySummaries.push({ pluginId: "locale-switch", name: "Locale Switch" });
  fixture.pluginInstances.push({ id: "locale", pluginId: "locale-switch", enabled: true });
  context.pluginNames = projectPluginDirectory(fixture).plugins;
  context.removalTarget = { status: "unresolved", description: "中英文切换", pluginIds: [] };
  context.userMessage = "加一个中英文切换按钮。";
  state.inspect.mockResolvedValue(fixture);
  await createTools(context);
  const result = await context.hostTools!.get("mutate_app_ui_model")!({ appUIModelHash: "a".repeat(64), operations: [{ type: "set_plugin_enabled", instanceId: "locale", enabled: false }] });
  expect(result).toMatchObject({ changed: false, status: "needs_target_clarification" });
  expect(state.inspect.mock.calls.some(([, operation]) => operation === "mutate_app_ui_model")).toBe(false);
  expect(context.validation!.ensureBaseline).not.toHaveBeenCalled();
});

it("checks the actual removal at the tool boundary even when routing omitted a removal target", async () => {
  const context = await project(); passingValidation(); state.inspect.mockResolvedValue(directoryFixture());
  state.model = new ScriptedModel(index => index === 0 ? new AIMessage('{"permission":"domain_write"}')
    : call("mutate_app_ui_model", { appUIModelHash: "a".repeat(64), operations: [{ type: "set_plugin_enabled", instanceId: "history-1", enabled: false }] }, "wrong-removal"));
  const runtime = new CreatorAgentRuntime(context.root, context.skills, contracts), events: any[] = [];
  await runtime.run({ threadId: "tool-target", runId: "tool-target-1", messages: [{ role: "user", content: "不要那个绘画历史面板" }] }, context.signal, async event => { events.push(event); });
  expect(state.model.calls).toBe(2);
  expect(state.inspect.mock.calls.some(([, name]) => name === "mutate_app_ui_model")).toBe(false);
  expect(events.at(-1).result).toMatchObject({ completion: "success", noChangeOutcome: { status: "needs_target_clarification" }, receipt: { files: [] } });
});

it("does not hide cancellation behind an unavailable Plugin directory", async () => {
  const context = await project(), controller = new AbortController(); controller.abort(); context.signal = controller.signal;
  await expect(preparePluginDirectory(context)).rejects.toThrow();
  expect(state.inspect).not.toHaveBeenCalled();
});

it("completes a consecutive edit with no model discovery/read call and recomputes read-only permissions on the next request", async () => {
  const context = await project(); passingValidation();
  state.inspect.mockImplementation(() => inspectResult(context.root));
  const runtime = new CreatorAgentRuntime(context.root, context.skills, contracts), events: any[] = [];
  const run = (runId: string, content: string) => runtime.run({ threadId: "consecutive", runId, messages: [{ role: "user", content }] }, context.signal, async event => { events.push(event); });
  state.model = new ScriptedModel(index => [new AIMessage('{"permission":"domain_write"}'),
    call("inspect_ui_edit_context", { pluginId: "composer" }, "locate"),
    call("edit_file_from_read", { file_path: entry, mode: "replace_lines", start_line: 1, replacement: original.replace("48", "56") }, "edit-1"),
    new AIMessage("done"),
  ][index]!);
  await run("first", "输入框高度改成56");
  expect(events.at(-1)?.result.completion).toBe("success");
  const previous = events.length;
  state.model = new ScriptedModel((index, messages) => {
    if (index === 0) return new AIMessage('{"permission":"domain_write"}');
    expect(JSON.stringify(messages)).toContain("Host editing context");
    expect(JSON.stringify(messages)).toContain("minHeight: 56");
    return index === 1 ? call("edit_file_from_read", { file_path: entry, mode: "replace_lines", start_line: 1, replacement: original.replace("48", "52") }, "edit-2") : new AIMessage("done");
  });
  await run("second", "再降低4像素");
  expect(events.slice(previous).filter(event => event.type === "TOOL_CALL_START").map(event => event.toolCallName)).toEqual(["edit_file_from_read"]);
  expect(await readFile(path.join(context.root, entry), "utf8")).toContain("minHeight: 52");
  expect(state.inspect.mock.calls.filter(([, operation]) => operation === "inspect_ui_plugin")).toHaveLength(1);
  expect(state.model.calls).toBe(3); // Includes the separate permission classifier.
  state.model = new ScriptedModel((_index, messages) => { expect(JSON.stringify(messages)).toContain("minHeight: 52"); return new AIMessage("read only"); });
  await run("readonly", "只分析一下当前输入框");
  expect(events.at(-1)?.result.executionPolicy).toBe("read-only");
  expect(state.model.bound.every((names: string[]) => !names.includes("edit_file_from_read"))).toBe(true);
  expect(visibleTool("inspect_ui_edit_context", { ...context, readOnly: true })).toBe(true);
  expect(await readFile(path.join(context.root, entry), "utf8")).toContain("minHeight: 52");
});


it("automatically follows an ordinary project inspection and config edit without a selected edit tool", async () => {
  const context = await project(), sessions = new EditingSessionStore(); passingValidation();
  const ownerPath = "src/应用/conversation/config/width.ts";
  await writeFile(path.join(context.root, ownerPath), "export const width = 480;\n");
  state.inspect.mockResolvedValue({ authoringTargetCatalog: { candidates: [{ id: "panel.width", kind: "application_config", name: "Panel width" }], bindings: [{ targetId: "panel.width", ownerPath }] } });
  await createTools(context);
  await context.hostTools!.get("inspect_ui_project")!({ view: "composition" });
  await readProjectFile(context, { file_path: ownerPath });
  await context.hostTools!.get("edit_file")!({ file_path: ownerPath, old_string: "480", new_string: "440" });
  expect(context.editingSelection).toBeUndefined();
  await sessions.remember(context);
  const followup = next(context), prepared = await sessions.prepare(followup);
  expect(prepared).toMatchObject({ status: "fresh", target: { id: "panel.width", entryPath: ownerPath } });
  expect("files" in prepared! && prepared.files?.[0]?.content).toContain("440");
  await createTools(followup);
  await followup.hostTools!.get("edit_file_from_read")!({ file_path: ownerPath, mode: "replace_lines", start_line: 1, replacement: "export const width = 400;\n" });
  expect(await readFile(path.join(context.root, ownerPath), "utf8")).toContain("400");
  expect(state.inspect).toHaveBeenCalledTimes(1);
});

it("follows actual direct-file edits and replaces the previous owner when the task changes", async () => {
  const context = await project(), sessions = new EditingSessionStore(); passingValidation();
  state.inspect.mockImplementation(() => inspectResult(context.root));
  await inspectEditingContext(context, { pluginId: "composer" });
  const file = "src/应用/conversation/config/width.ts";
  await writeFile(path.join(context.root, file), "export const width = 480;\n");
  await createTools(context); await readProjectFile(context, { file_path: file });
  await context.hostTools!.get("edit_file")!({ file_path: file, old_string: "480", new_string: "440" });
  await sessions.remember(context);
  expect(await sessions.prepare(next(context))).toMatchObject({ status: "fresh", target: { kind: "project_file", entryPath: file } });
  await writeFile(path.join(context.root, file), "external edit");
  expect(await sessions.prepare(next(context))).toMatchObject({ status: "stale" });
});

it("reuses concurrent and repeated composition inspections, and invalidates on external edits or new files", async () => {
  const context = await project();
  state.inspect.mockResolvedValue({ authoringTargetCatalog: { candidates: [], bindings: [] } });
  const results = await Promise.all([inspectProject(context, { view: "composition" }), inspectProject(context, { view: "composition" })]);
  results[0]!.mutated = true;
  expect(results[1]).not.toHaveProperty("mutated");
  await inspectProject(context, { view: "composition" });
  expect(state.inspect).toHaveBeenCalledTimes(1);
  await writeFile(path.join(context.root, entry), "external edit");
  await inspectProject(context, { view: "composition" });
  expect(state.inspect).toHaveBeenCalledTimes(2);
  await writeFile(path.join(context.root, "src/new.ts"), "new file");
  await inspectProject(context, { view: "composition" });
  expect(state.inspect).toHaveBeenCalledTimes(3);
  await inspectProject(next(context), { view: "composition" });
  expect(state.inspect).toHaveBeenCalledTimes(4);
});

it("does not cache a failed inspection or confuse a full observation with its summary", async () => {
  const context = await project();
  const raw = { appUIModel: { hash: "current", tree: [{ id: "p11", enabled: true }] },
    authoringTargetCatalog: { candidates: [{ id: "plugin-source:composer", kind: "plugin_source", name: "Composer", description: "long description", intents: ["long intent"] }], bindings: [{ targetId: "plugin-source:composer", ownerPath: entry }] },
    creatorActions: { candidates: [{ actionId: "exact-action", label: "long label", description: "long description", target: { pluginId: "composer" } }] } };
  state.inspect.mockRejectedValueOnce(new Error("offline")).mockResolvedValue(raw);
  await expect(inspectProject(context, { view: "composition" })).rejects.toThrow("offline");
  await createTools(context);
  const summary = await context.hostTools!.get("inspect_ui_project")!({ view: "composition" });
  expect(summary.projection.fullResult.input.detail).toBe("full");
  expect(summary.appUIModel).toEqual(raw.appUIModel);
  expect(summary.authoringTargetCatalog.bindings).toEqual(raw.authoringTargetCatalog.bindings);
  expect(summary.creatorActions.candidates[0]).toMatchObject({ actionId: "exact-action" });
  const full = await context.hostTools!.get("inspect_ui_project")!({ view: "composition", detail: "full" });
  expect(full).toEqual(raw);
  expect(state.inspect).toHaveBeenCalledTimes(2);
  expect(projectInspectionSummary(raw)).not.toBe(raw);
});

it("reuses only successful checks of unchanged contents within the same run, with an explicit force escape", async () => {
  const context = await project();
  const validation = new CreatorValidation(context.root, context.activity, () => context.signal);
  state.inspect.mockResolvedValue({ status: "passed", errors: [] });
  const script = vi.spyOn(validation as any, "script").mockResolvedValue({ command: "typecheck", status: "passed", exitCode: 0, output: "", truncated: false, revision: 0 });
  expect(await validation.validate({})).toMatchObject({ status: "passed" });
  expect(await validation.validate({})).toMatchObject({ status: "passed", reused: true });
  expect(script).toHaveBeenCalledTimes(2); // baseline and current
  await writeFile(path.join(context.root, entry), "external edit");
  expect(await validation.validate({})).not.toHaveProperty("reused");
  expect(script).toHaveBeenCalledTimes(3);
  await validation.validate({ force: true }); expect(script).toHaveBeenCalledTimes(4);
  await validation.validate({ mode: "clean" }); expect(script).toHaveBeenCalledTimes(5);
  await validation.validate({ includeBuild: true }); expect(script).toHaveBeenCalledTimes(7);
});

it.each(["", "已完成"])("rejects a write completion with no project change even when the model says %s", async reply => {
  const context = await project();
  state.model = new ScriptedModel(index => index === 0 ? new AIMessage('{"permission":"domain_write"}') : new AIMessage(reply));
  const runtime = new CreatorAgentRuntime(context.root, context.skills, contracts), events: any[] = [];
  await runtime.run({ threadId: "empty", runId: "empty-1", messages: [{ role: "user", content: "把输入框加高" }] }, context.signal, async event => { events.push(event); });
  expect(events.at(-1)).toMatchObject({ result: { completion: "blocked", creatorRunOutcome: { status: "failed", code: "CREATOR_NO_COMPLETION_EVIDENCE", changeStatus: "none" } } });
});

it("accepts a controlled no-op instead of requiring unnecessary edits", async () => {
  const context = await project(); passingValidation();
  state.model = new ScriptedModel(index => [new AIMessage('{"permission":"domain_write"}'),
    call("read_file", { file_path: entry }, "read"),
    call("edit_file", { file_path: entry, old_string: "48", new_string: "48" }, "noop"), new AIMessage("已经是48")][index]!);
  const runtime = new CreatorAgentRuntime(context.root, context.skills, contracts), events: any[] = [];
  await runtime.run({ threadId: "noop", runId: "noop-1", messages: [{ role: "user", content: "高度改成48" }] }, context.signal, async event => { events.push(event); });
  expect(events.at(-1)).toMatchObject({ result: { completion: "success", noChangeOutcome: { status: "already_current", toolName: "edit_file" } } });
  expect(await readFile(path.join(context.root, entry), "utf8")).toBe(original);
});

it("continues a prose-only write stop from actual completion evidence without changing the system prompt", async () => {
  const context = await project(); passingValidation();
  state.model = new ScriptedModel((index, messages) => {
    if (index === 3) { expect(JSON.stringify(messages)).toContain("Completion check: no project change"); expect(JSON.stringify(messages)).not.toContain("文件已新鲜读取，我直接改成56。"); }
    return [new AIMessage('{"permission":"domain_write"}'),
      call("read_file", { file_path: entry }, "read"),
      new AIMessage("文件已新鲜读取，我直接改成56。"),
      call("edit_file", { file_path: entry, old_string: "48", new_string: "56" }, "actual-edit"),
      new AIMessage("done")][index]!;
  });
  const runtime = new CreatorAgentRuntime(context.root, context.skills, contracts), events: any[] = [];
  await runtime.run({ threadId: "continue", runId: "continue-1", messages: [{ role: "user", content: "高度改成56" }] }, context.signal, async event => { events.push(event); });
  expect(events.at(-1)).toMatchObject({ result: { completion: "success" } });
  expect(await readFile(path.join(context.root, entry), "utf8")).toContain("minHeight: 56");
  expect(events.filter(e => e.type === "TOOL_CALL_START").map(e => e.toolCallName)).toEqual(["read_file", "edit_file"]);
});

it("keeps logical working-set paths portable when sourceRoot uses Windows separators", async () => {
  const context = await project(), sessions = new EditingSessionStore(); passingValidation();
  await writeFile(path.join(context.root, ".agent-ui/project.json"), JSON.stringify({ sourceRoot: path.win32.join("src", "应用") }));
  await createTools(context); await readProjectFile(context, { file_path: entry });
  await context.hostTools!.get("edit_file")!({ file_path: entry, old_string: "48", new_string: "56" });
  await sessions.remember(context);
  const prepared = await sessions.prepare(next(context));
  expect(prepared).toMatchObject({ status: "fresh", target: { entryPath: entry } });
  expect("files" in prepared! && prepared.files?.[0]?.path).toBe("/" + entry);
});

it("falls back to fresh Operator and validation checks when a project exceeds the cache byte budget", async () => {
  const context = await project(); await writeFile(path.join(context.root, "large-fixture.bin"), Buffer.alloc(1_000_001));
  state.inspect.mockResolvedValue({ status: "passed", errors: [] });
  await inspectProject(context, { view: "composition" }); await inspectProject(context, { view: "composition" });
  expect(state.inspect).toHaveBeenCalledTimes(2);
  const validation = new CreatorValidation(context.root, context.activity, () => context.signal);
  const script = vi.spyOn(validation as any, "script").mockResolvedValue({ command: "typecheck", status: "passed", exitCode: 0, output: "", truncated: false, revision: 0 });
  expect(await validation.validate({})).toMatchObject({ status: "passed" });
  expect(await validation.validate({})).not.toHaveProperty("reused");
  expect(script).toHaveBeenCalledTimes(3);
});

it("accepts a fresh controlled file no-op without a whole-project cache fingerprint", async () => {
  const context = await project(); passingValidation(); await writeFile(path.join(context.root, "large-fixture.bin"), Buffer.alloc(1_000_001));
  state.model = new ScriptedModel(index => [new AIMessage('{"permission":"domain_write"}'),
    call("read_file", { file_path: entry }, "read"), call("edit_file", { file_path: entry, old_string: "48", new_string: "48" }, "noop"), new AIMessage("已是目标状态")][index]!);
  const runtime = new CreatorAgentRuntime(context.root, context.skills, contracts), events: any[] = [];
  await runtime.run({ threadId: "large-noop", runId: "large-noop-1", messages: [{ role: "user", content: "高度改成48" }] }, context.signal, async event => { events.push(event); });
  expect(events.at(-1)).toMatchObject({ result: { completion: "success", noChangeOutcome: { status: "already_current" } } });
});


it("does not swallow cancellation when cache fingerprinting falls back", async () => {
  const context = await project(), controller = new AbortController(); controller.abort(new Error("test cancellation"));
  await expect(inspectProject({ ...context, signal: controller.signal }, { view: "composition" })).rejects.toThrow("test cancellation");
  expect(state.inspect).not.toHaveBeenCalled();
});


it("rechecks validation when an existing warning becomes an explicit repair target", async () => {
  const context = await project(), debugging = new DebuggingEvidence();
  state.inspect.mockResolvedValue({ status: "passed", errors: [] });
  const validation = new CreatorValidation(context.root, context.activity, () => context.signal, debugging);
  const message = "src/warn.ts: error TS1000: existing";
  const script = vi.spyOn(validation as any, "script").mockResolvedValue({ command: "typecheck", status: "failed", exitCode: 1, output: message, truncated: false, revision: 0 });
  expect(await validation.validate({})).toMatchObject({ status: "passed" });
  const targetId = staticTargetId(message);debugging.observeStatic({ revision: 0, diagnostics: [{ targetId, file: "src/warn.ts", message }] });debugging.select(targetId, 0);
  expect(await validation.validate({})).toMatchObject({ status: "failed", targetRemaining: [targetId] });
  expect(script).toHaveBeenCalledTimes(3);
});

it("uses structured permissions with the latest request separated from bounded historical data", async () => {
  const context = await project();
  const model = { invoke: vi.fn().mockResolvedValue(new AIMessage('{"permission":"domain_write"}')) };
  state.model = model;
  const runtime = new CreatorAgentRuntime(context.root, context.skills, contracts);
  const messages = [
    { role: "user", content: "old user request" }, { role: "assistant", content: "old reply" },
    { role: "user", content: "改推荐问题" }, ...Array.from({ length: 10 }, () => ({ role: "assistant", content: "进度".repeat(5000) })),
    { role: "user", content: "第二项再改短一点，其余不要动" },
  ];
  expect(await (runtime as any).classify(messages, "structured", context.signal)).toEqual({ readOnly: false });
  const [input, options] = model.invoke.mock.calls[0]!;
  expect(input).toHaveLength(2);
  expect(options.response_format).toMatchObject({ type: "json_schema", json_schema: { strict: true, schema: { additionalProperties: false } } });
  const data = JSON.parse(input[1].content);
  expect(data.request).toBe(messages.at(-1)!.content);
  expect(data.context).toHaveLength(2);
  expect(data.context[1].assistant.length).toBe(2000);
  expect(input[0].content).toContain("Never infer mutation authorization");
});

it("falls back only for an explicitly unsupported schema format and still rejects invalid authorization", async () => {
  const context = await project();
  const invoke = vi.fn().mockRejectedValueOnce(Object.assign(new Error("response_format json_schema is not supported"), { status: 400 }))
    .mockResolvedValueOnce(new AIMessage('{"permission":"inspect_read_only"}'));
  state.model = { invoke };
  const runtime = new CreatorAgentRuntime(context.root, context.skills, contracts);
  expect(await (runtime as any).classify([{ role: "user", content: "现在是什么配置？" }], "fallback-schema", context.signal)).toEqual({ readOnly: true });
  expect(invoke.mock.calls[1]![1].response_format).toEqual({ type: "json_object" });
  invoke.mockReset().mockResolvedValue(new AIMessage('{"permission":"domain_write","approve":true}'));
  await expect((runtime as any).classify([{ role: "user", content: "再改小一点" }], "invalid-schema", context.signal)).rejects.toThrow("CREATOR_REQUEST_ROUTE_INVALID");
  expect(invoke).toHaveBeenCalledTimes(3);
});

it("honors a current read-only request even after historical edits and ignores unrelated-file exclusions", async () => {
  const context = await project(), invoke = vi.fn().mockResolvedValue(new AIMessage('{"permission":"domain_write"}'));
  state.model = { invoke };
  const runtime = new CreatorAgentRuntime(context.root, context.skills, contracts);
  expect(await (runtime as any).classify([{ role: "user", content: "把名称改掉" }, { role: "user", content: "现在只分析，先不要改代码" }], "read-only", context.signal)).toEqual({ readOnly: true });
  for (const content of ["先查一下聊天历史按钮是哪个插件做的，只看别改", "选文件的加号对应哪个插件？只查看，不改。", "先看一下，不要动代码", "输入框旁边上传附件那个按钮用什么插件？先只告诉我。", "这件事先不改了，所有插件保持原样。", "先算了，保留现在所有功能，不做修改。"]) {
    expect(await (runtime as any).classify([{ role: "user", content }], "inspect-phrasing", context.signal)).toEqual({ readOnly: true });
  }
  expect(invoke).not.toHaveBeenCalled();
  expect(await (runtime as any).classify([{ role: "user", content: "把名称改成小助手，其他文件不要改" }], "write", context.signal)).toEqual({ readOnly: false });
});

it.each(["\n", "\r\n"])("edits a freshly read middle line with native %j boundaries and preserves later lines", async eol => {
  const context = await project(); passingValidation();
  const content = ["export const first = 1;", "export const second = 2;", ""].join(eol);
  await writeFile(path.join(context.root, entry), content);
  await createTools(context); await readProjectFile(context, { file_path: entry });
  await context.hostTools!.get("edit_file_from_read")!({ file_path: entry, mode: "replace_lines", start_line: 1, replacement: "export const first = 3;" });
  expect(await readFile(path.join(context.root, entry), "utf8")).toBe(["export const first = 3;", "export const second = 2;", ""].join(eol));
  await expect(context.hostTools!.get("edit_file_from_read")!({ file_path: entry, mode: "replace_lines", start_line: 2, replacement: "" })).rejects.toThrow();
});

it("verifies already-absent/effectively disabled Plugins without edits, reads or granting authority", async () => {
  const context = await project(); context.readOnly = true;
  state.inspect.mockResolvedValue(directoryFixture()); await createTools(context);
  expect(visibleTool("verify_creator_outcome", context)).toBe(true);
  const tool = context.hostTools!.get("verify_creator_outcome")!;
  expect(await tool({ checks: [{ kind: "plugin_enabled", pluginId: "dictation", enabled: false }, { kind: "plugin_enabled", pluginId: "composer", enabled: false }] })).toMatchObject({ status: "satisfied" });
  expect(context.noChangeOutcome?.postconditions).toHaveLength(2);
  expect(context.activity.observations.get(entry)).toBeUndefined();
  expect(context.activity.revision).toBe(0);
  expect(context.authorizedPlugins.size).toBe(0);
  expect(await tool({ checks: [{ kind: "plugin_enabled", pluginId: "unknown", enabled: false }] })).toMatchObject({ status: "not_satisfied" });
  expect(context.noChangeOutcome).toBeUndefined();
  expect(await tool({ checks: [{ kind: "plugin_enabled", pluginId: "history", instanceId: "missing", enabled: false }] })).toMatchObject({ status: "not_satisfied" });
  expect(await tool({ checks: [{ kind: "plugin_enabled", pluginId: "history", enabled: false }] })).toMatchObject({ status: "not_satisfied" });
});

it("finishes an already-satisfied write request with rechecked exact conditions and zero mutations", async () => {
  const context = await project(); state.inspect.mockResolvedValue(directoryFixture());
  state.model = new ScriptedModel(index => [new AIMessage('{"permission":"domain_write"}'),
    call("verify_creator_outcome", { checks: [{ kind: "plugin_enabled", pluginId: "dictation", enabled: false }, { kind: "file_text", path: entry, text: "minHeight: 48", present: true }] }, "verify"),
    new AIMessage("当前已经关闭，保留代码。")][index]!);
  const runtime = new CreatorAgentRuntime(context.root, context.skills, contracts), events: any[] = [];
  await runtime.run({ threadId: "satisfied", runId: "satisfied-1", messages: [{ role: "user", content: "关闭语音输入并保持高度48" }] }, context.signal, async event => { events.push(event); });
  expect(events.at(-1)).toMatchObject({ result: { completion: "success", noChangeOutcome: { status: "already_current", toolName: "verify_creator_outcome" } } });
  expect(events.at(-1).result.receipt.files).toHaveLength(0);
});

it("revokes a successful goal verification if the file changes before completion", async () => {
  const context = await project(); state.inspect.mockResolvedValue(directoryFixture());
  state.model = new ScriptedModel(index => {
    if (index === 0) return new AIMessage('{"permission":"domain_write"}');
    if (index === 1) return call("verify_creator_outcome", { checks: [{ kind: "file_text", path: entry, text: "minHeight: 48", present: true }] }, "verify-stale");
    return new AIMessage("already done");
  });
  const runtime = new CreatorAgentRuntime(context.root, context.skills, contracts), events: any[] = [];
  await runtime.run({ threadId: "stale-outcome", runId: "stale-outcome-1", messages: [{ role: "user", content: "高度改成48" }] }, context.signal, async event => {
    events.push(event);
    if (event.type === "TOOL_CALL_RESULT") await writeFile(path.join(context.root, entry), original.replace("48", "20"));
  });
  expect(events.at(-1)).toMatchObject({ result: { completion: "blocked" } });
  expect(events.at(-1).result.noChangeOutcome).toBeUndefined();
});

it("allows exact text verification without source-edit evidence and denies protected or missing files", async () => {
  const context = await project(); await createTools(context);
  const tool = context.hostTools!.get("verify_creator_outcome")!;
  expect(await tool({ checks: [{ kind: "file_text", path: entry, text: "minHeight: 48", present: true }] })).toMatchObject({ status: "satisfied" });
  expect(context.activity.observations.get(entry)).toBeUndefined();
  for (const file of ["/.env.local", "/skills/SKILL.md", "../outside.ts", "/node_modules/pkg/index.js"]) await expect(tool({ checks: [{ kind: "file_text", path: file, text: "x", present: false }] })).rejects.toThrow();
  expect(context.noChangeOutcome).toBeUndefined();
  await expect(tool({ checks: [{ kind: "file_text", path: "missing.ts", text: "x", present: false }] })).rejects.toThrow();
});

it("bounds unsupported completion retries across intervening read-only tool calls at the same revision", async () => {
  const context = await project();
  state.model = new ScriptedModel(index => index === 0 ? new AIMessage('{"permission":"domain_write"}')
    : index % 2 ? new AIMessage("done") : call("read_file", { file_path: entry, offset: index, limit: 1 }, "read-" + index));
  const runtime = new CreatorAgentRuntime(context.root, context.skills, contracts), events: any[] = [];
  await runtime.run({ threadId: "stop-retries", runId: "stop-retries-1", messages: [{ role: "user", content: "高度改成56" }] }, context.signal, async event => { events.push(event); });
  expect(events.at(-1)).toMatchObject({ result: { completion: "blocked" } });
  expect(state.model.calls).toBe(6);
});

it("rechecks Plugin conditions when whole-project cache identity is unavailable and rejects changed composition", async () => {
  const context = await project(); await writeFile(path.join(context.root, "large-fixture.bin"), Buffer.alloc(1_000_001));
  const before = directoryFixture(), after = directoryFixture();
  after.appUIModel.hash = "b".repeat(64);
  after.pluginInstances.push({ id: "voice", pluginId: "dictation", enabled: true, effectiveEnabled: true, target: { type: "application" } as any, index: 0 });
  state.inspect.mockResolvedValue(before); await createTools(context);
  const tool = context.hostTools!.get("verify_creator_outcome")!;
  expect(await tool({ checks: [{ kind: "plugin_enabled", pluginId: "dictation", enabled: false }] })).toMatchObject({ status: "satisfied" });
  expect(state.inspect).toHaveBeenCalledTimes(2);
  state.inspect.mockReset().mockResolvedValueOnce(before).mockResolvedValueOnce(after);
  await expect(tool({ checks: [{ kind: "plugin_enabled", pluginId: "dictation", enabled: false }] })).rejects.toThrow("CREATOR_OUTCOME_EVIDENCE_STALE");
  expect(context.noChangeOutcome).toBeUndefined();
});

it("does not turn unavailable project evidence into an already-satisfied condition", async () => {
  const context = await project(); state.inspect.mockResolvedValue({ status: "unavailable" }); await createTools(context);
  await expect(context.hostTools!.get("verify_creator_outcome")!({ checks: [{ kind: "plugin_enabled", pluginId: "dictation", enabled: false }] })).rejects.toThrow("CREATOR_OUTCOME_EVIDENCE_UNAVAILABLE");
  expect(context.noChangeOutcome).toBeUndefined();
});

it("allows static validation and outcome inspection together without allowing mutation batches", async () => {
  const context = await project(); passingValidation(); state.inspect.mockResolvedValue(directoryFixture());
  state.model = new ScriptedModel(index => [new AIMessage('{"permission":"domain_write"}'), new AIMessage({ content: "", tool_calls: [
    { name: "validate_creator_changes", args: { includeBuild: false }, id: "check-static", type: "tool_call" },
    { name: "verify_creator_outcome", args: { checks: [{ kind: "plugin_enabled", pluginId: "dictation", enabled: false }] }, id: "check-composition", type: "tool_call" },
  ] }), new AIMessage("已关闭，无需修改。")][index]!);
  const runtime = new CreatorAgentRuntime(context.root, context.skills, contracts), events: any[] = [];
  await runtime.run({ threadId: "parallel-checks", runId: "parallel-checks-1", messages: [{ role: "user", content: "关闭语音输入" }] }, context.signal, async event => { events.push(event); });
  expect(events.at(-1)).toMatchObject({ result: { completion: "success" } });
  expect(events.filter(e => e.type === "TOOL_CALL_START").map(e => e.toolCallName).sort()).toEqual(["validate_creator_changes", "verify_creator_outcome"]);
});

it("does not admit a build beside other calls as a read-only validation batch", async () => {
  const context = await project(); passingValidation();
  state.model = new ScriptedModel(index => index === 0 ? new AIMessage('{"permission":"domain_write"}') : new AIMessage({ content: "", tool_calls: [
    { name: "validate_creator_changes", args: { includeBuild: true }, id: "build", type: "tool_call" },
    { name: "read_file", args: { file_path: entry }, id: "read", type: "tool_call" },
  ] }));
  const runtime = new CreatorAgentRuntime(context.root, context.skills, contracts), events: any[] = [];
  await expect(runtime.run({ threadId: "build-batch", runId: "build-batch-1", messages: [{ role: "user", content: "修改输入框" }] }, context.signal, async event => { events.push(event); })).rejects.toThrow("CREATOR_TOOL_BATCH_POLICY");
  expect(events.some(e => e.type === "TOOL_CALL_START")).toBe(false);
});

it("executes a native ordinary file-edit batch in order with fresh per-step checks", async () => {
  const context = await project(); passingValidation();
  state.model = new ScriptedModel(index => [new AIMessage('{"permission":"domain_write"}'),
    call("read_file", { file_path: entry }, "read-serial"), new AIMessage({ content: "", tool_calls: [
      { name: "edit_file", args: { file_path: entry, old_string: "48", new_string: "56" }, id: "first-edit", type: "tool_call" },
      { name: "edit_file", args: { file_path: entry, old_string: "56", new_string: "60" }, id: "second-edit", type: "tool_call" },
    ] }), new AIMessage("done")][index]!);
  const runtime = new CreatorAgentRuntime(context.root, context.skills, contracts), events: any[] = [];
  await runtime.run({ threadId: "serial-edits", runId: "serial-edits-1", messages: [{ role: "user", content: "高度改成60" }] }, context.signal, async event => { events.push(event); });
  expect(events.at(-1)).toMatchObject({ result: { completion: "success" } });
  expect(await readFile(path.join(context.root, entry), "utf8")).toContain("minHeight: 60");
  expect(events.filter(e => e.type === "TOOL_CALL_RESULT").map(e => JSON.parse(e.content).ok)).toEqual([true, true, true]);
});

it("skips later native file edits after a failed batch step without executing them", async () => {
  const context = await project(); passingValidation();
  state.model = new ScriptedModel(index => {
    if (index === 0) return new AIMessage('{"permission":"domain_write"}');
    if (index === 1) return call("read_file", { file_path: entry }, "read-failed-batch");
    if (index === 2) return new AIMessage({ content: "", tool_calls: [
      { name: "edit_file", args: { file_path: entry, old_string: "not present", new_string: "56" }, id: "failed-edit", type: "tool_call" },
      { name: "edit_file", args: { file_path: entry, old_string: "48", new_string: "60" }, id: "skipped-edit", type: "tool_call" },
    ] });
    return new AIMessage("unable");
  });
  const runtime = new CreatorAgentRuntime(context.root, context.skills, contracts), events: any[] = [];
  await runtime.run({ threadId: "failed-batch", runId: "failed-batch-1", messages: [{ role: "user", content: "高度改成60" }] }, context.signal, async event => { events.push(event); });
  expect(events.at(-1)).toMatchObject({ result: { completion: "blocked" } });
  expect(await readFile(path.join(context.root, entry), "utf8")).toBe(original);
  expect(events.filter(e => e.type === "TOOL_CALL_RESULT").map(e => JSON.parse(e.content).error?.code)).toEqual([undefined, "EDIT_MATCH_AMBIGUOUS_OR_MISSING", "CREATOR_BATCH_DEPENDENCY_FAILED"]);
});

it("keeps generated Vite cache out of transaction snapshots without bypassing limits for project content", async () => {
  const context = await project();
  await mkdir(path.join(context.root, ".vite", "deps"), { recursive: true });
  const large = Buffer.alloc(20_000_001, "x");
  await writeFile(path.join(context.root, ".vite", "deps", "cache.js"), large);
  const snapshot = await context.activity.captureSource();
  expect(snapshot.has(entry)).toBe(true);
  expect([...snapshot.keys()].some(name => name.startsWith(".vite/"))).toBe(false);
  await writeFile(path.join(context.root, "project-content.txt"), large);
  await expect(context.activity.captureSource()).rejects.toThrow("CREATOR_TRANSACTION_SNAPSHOT_TOO_LARGE");
});

it("ends a non-recoverable Host capacity failure without inviting further model retries", async () => {
  const context = await project(); passingValidation(); state.inspect.mockResolvedValue(directoryFixture());
  vi.spyOn(RunActivity.prototype, "captureSource").mockRejectedValue(new Error("CREATOR_TRANSACTION_SNAPSHOT_TOO_LARGE"));
  state.model = new ScriptedModel(index => index === 0 ? new AIMessage('{"permission":"domain_write"}')
    : call("mutate_app_ui_model", { appUIModelHash: "a".repeat(64), operations: [{ type: "set_plugin_enabled", instanceId: "history-1", enabled: false }] }, "capacity-" + index));
  const runtime = new CreatorAgentRuntime(context.root, context.skills, contracts), events: any[] = [];
  await expect(runtime.run({ threadId: "capacity", runId: "capacity-1", messages: [{ role: "user", content: "隐藏会话历史入口" }] }, context.signal, async event => { events.push(event); })).rejects.toThrow("CREATOR_TRANSACTION_SNAPSHOT_TOO_LARGE");
  expect(events.filter(event => event.type === "TOOL_CALL_START")).toHaveLength(1);
  expect(state.model.calls).toBe(2);
});

it("edits a history-delete implementation through the real graph without an extra confirmation", async () => {
  const context = await project("history-service"); passingValidation();
  const target = "src/应用/services/conversations/http-data-source.ts";
  const original = 'export async function deleteHistory(id: string): Promise<void> { await fetch(`/conversations/${encodeURIComponent(id)}`, { method: "DELETE" }); }\n';
  await mkdir(path.dirname(path.join(context.root, target)), { recursive: true });
  await writeFile(path.join(context.root, target), original);
  state.inspect.mockImplementation(async (_root, operation) => operation === "inspect_ui_services" ? { services: [] } : directoryFixture());
  state.model = new ScriptedModel((index, messages) => {
    if (index === 0) return new AIMessage('{"permission":"domain_write"}');
    if (index === 1) return call("enable_creator_tools", { groups: ["services"] }, "service-tools");
    if (index === 2) return call("read_file", { file_path: target }, "read-history");
    if (index === 3) return call("prepare_ui_service_implementation_change", {
      implementationPath: "services/conversations/http-data-source.ts",
      edits: [{ oldText: "/conversations/", newText: "/history/" }], impactSummary: "修改单条历史会话删除路径，影响所有使用此实现的删除调用，保留其他历史操作。",
    }, "prepare-history");
    if (index === 4) {
      const result = JSON.parse(String([...messages].reverse().find(message => message.type === "tool")!.content));
      expect(result).toMatchObject({ ok: true, result: { status: "ready" } });
      return call("apply_ui_service_implementation_change", { planId: result.result.planId }, "apply-history");
    }
    return new AIMessage("已完成删除接口配置。");
  });
  const runtime = new CreatorAgentRuntime(context.root, context.skills, contracts), events: any[] = [];
  const publish = async (event: any) => { events.push(event); };
  await runtime.run({ threadId: "history-service", runId: "history-service-1", messages: [{ role: "user", content: "接入删除某一个历史会话的接口" }] }, context.signal, publish);
  expect(events.some(event => event.name === "on_interrupt")).toBe(false);
  expect(runtime.pending.size).toBe(0);
  expect(await readFile(path.join(context.root, target), "utf8")).toBe(original.replace("/conversations/", "/history/"));
  expect(events.at(-1)?.result.completion).toBe("success");
  expect(events.at(-1).result.receipt.files.map((file: any) => file.path)).toEqual([target]);
});

it("keeps flat and legacy layout/revision files under Operator mutation", async () => {
  const context = await project(); passingValidation(); await createTools(context);
  for (const file of ["app-ui.json", "composition-revision.generated.json", "app-ui/app-ui.json", "app-ui/composition-revision.generated.json", "APP-UI.JSON"]) {
    await expect(context.hostTools!.get("create_ui_source_file")!({ path: `src/应用/${file}`, content: "{}" })).rejects.toThrow("use Operator mutation");
  }
  expect(context.activity.revision).toBe(0);
});

it("resumes one joint development decision through LangGraph and writes its Plugin and Service without another approval", async () => {
  const context = await project("joint-development"); const root = context.root; passingValidation();
  state.inspect.mockImplementation(async (_root: string, name: string) => name === "list_ui_plugins" ? { pluginAssets: [{ pluginId: "composer" }] }
    : name === "inspect_ui_services" ? { services: [] } : name === "inspect_ui_plugin" ? inspectResult(root) : directoryFixture());
  const proposal = { targetPluginId: "dismiss", desiredOutcome: "Add a dismiss action", missingCapabilities: ["No cross-plugin collapse action exists"],
    deliveryContract: { capability: "dismiss", renderingCategory: "semantic-slot", placement: "composer.actions", lifecycle: "with composer", dependencies: ["help.card"], verificationMethod: "runtime" },
  };
  state.model = new ScriptedModel((index, messages) => {
    if (index === 0) return new AIMessage('{"permission":"domain_write"}');
    if (index === 1) return call("read_file", { file_path: "/" + entry }, "owner");
    if (index === 2) return call("prepare_ui_plugin_development", proposal, "proposal");
    if (index === 3) return call("enable_creator_tools", { groups: ["services"] }, "enable-services");
    if (index === 4) return call("prepare_ui_service_contract_change", { changeKind: "create", serviceName: "help.card", contractPath: "services/help-card.ts", ownerPluginId: "composer", consumers: [{ pluginId: "dismiss", dependencyMode: "required" }], reason: "Share the requested action" }, "preflight-service");
    if (index === 5) {
      const ready = JSON.parse(String([...messages].reverse().find(message => message.type === "tool")!.content));
      expect(ready.result.status).toBe("ready");
      return call("create_ui_service_contract", { planId: ready.result.planId, content: "export interface HelpCard { collapse(): void; }" }, "service");
    }
    if (index === 6) return call("create_ui_plugin", { pluginId: "dismiss", files: [
      { relativePath: "manifest.json", content: '{"id":"dismiss","name":"Dismiss","version":"0.0.1"}' },
      { relativePath: "definition.ts", content: "export default {};" }, { relativePath: "index.tsx", content: "export const Dismiss = () => null;" },
    ] }, "plugin");
    return call("ask_user_question", { steps: [{ id: "test-checkpoint", question: "Continue verification?", options: [{ id: "yes", label: "Yes" }, { id: "no", label: "No" }], selectionMode: "single", minSelections: 1, maxSelections: 1 }] }, "checkpoint");
  });
  const runtime = new CreatorAgentRuntime(root, context.skills, contracts); const events: any[] = []; const publish = async (event: any) => { events.push(event); };
  await runtime.run({ threadId: "joint", runId: "joint-1", messages: [{ role: "user", content: "给 composer 添加一个按钮插件。" }] }, new AbortController().signal, publish);
  const question = events.find(event => event.type === "CUSTOM" && event.name === "on_interrupt");
  expect(question.value.metadata.steps[0].id).toBe("plugin-development-decision");
  expect(runtime.pending.get("joint")!.context.authorizedPlugins.size).toBe(0);
  await expect(readFile(path.join(root, "src/应用/services/help-card.ts"))).rejects.toMatchObject({ code: "ENOENT" });
  await runtime.run({ threadId: "joint", runId: "joint-2", messages: [], forwardedProps: { command: { resume: { interruptId: question.value.id, answers: { "plugin-development-decision": ["start"] } } } } }, new AbortController().signal, publish);
  expect(events.filter(event => event.type === "RUN_ERROR")).toEqual([]);
  expect(await readFile(path.join(root, "src/应用/services/help-card.ts"), "utf8")).toContain("collapse");
  expect(await readFile(path.join(root, "src/应用/plugins/dismiss/index.tsx"), "utf8")).toContain("Dismiss");
  const questions = events.filter(event => event.type === "CUSTOM" && event.name === "on_interrupt");
  expect(questions.map(event => event.value.metadata.steps[0].id)).toEqual(["plugin-development-decision", "test-checkpoint"]);
  expect(runtime.pending.get("joint")!.context.authorizedPlugins.has("dismiss")).toBe(true);
  expect(events.at(-1).result.receipt.files).toHaveLength(4);
});

it("keeps project source ownership distinct from npm implementation takeover in editing evidence", async () => {
  const context = await project();
  const npm = await inspectResult(context.root); state.inspect.mockResolvedValue(npm);
  const thin = await inspectEditingContext(context, { pluginId: "composer" });
  expect(thin).toMatchObject({ editingPolicy: { implementationOwnership: "npm", implementationTakeoverRequired: true, entryPath: entry } });
  const custom = { ...npm, asset: { ...npm.asset, ownership: "project_source" }, application: undefined };
  state.inspect.mockResolvedValue(custom);
  const owned = await inspectEditingContext(context, { pluginId: "composer" });
  expect(owned).toMatchObject({ editingPolicy: { implementationOwnership: "project", implementationTakeoverRequired: false } });
  expect(context.pluginOwnerships!.get("composer")!.implementationOwnership).toBe("project");
  expect(context.authorizedPlugins.size).toBe(0); // ownership never fabricates a new-development grant
});

it.each(["approve", "decline"])("uses the native source-takeover question for %s and permits subsequent owned-source edits", async choice => {
  const context = await project("takeover-question"); passingValidation(); let applications = 0;
  state.inspect.mockImplementation(async (_root: string, name: string) => {
    if (name === "inspect_ui_plugin") return inspectResult(context.root);
    if (name === "plan_plugin_source_takeover") return { pluginId: "composer", planHash: "a".repeat(64), version: "1.0.0" };
    if (name === "takeover_plugin_source") { applications++; await writeFile(path.join(context.root, entry), original + "// owned implementation selected\n"); return { status: "applied" }; }
    return directoryFixture();
  });
  state.model = new ScriptedModel(index => {
    if (index === 0) return new AIMessage('{"permission":"domain_write"}');
    if (index === 1) return call("enable_creator_tools", { groups: ["plugin_authoring"] }, "takeover-group");
    if (index === 2) return call("takeover_plugin_source", { pluginId: "composer" }, "takeover");
    if (index === 3) return call("read_file", { file_path: entry }, "owned-read");
    if (index === 4) return call("edit_file", { file_path: entry, old_string: "minHeight: 48", new_string: "minHeight: 64" }, "owned-edit");
    return new AIMessage("已接管并修改输入框。");
  });
  const runtime = new CreatorAgentRuntime(context.root, context.skills, contracts), events: any[] = [];
  const publish = async (event: any) => { events.push(event); };
  await runtime.run({ threadId: "takeover-question", runId: "takeover-question-1", messages: [{ role: "user", content: "接管 composer 的实现源码并修改输入框" }] }, context.signal, publish);
  const pending = events.find(event => event.name === "on_interrupt").value;
  expect(applications).toBe(0); expect(await readFile(path.join(context.root, entry), "utf8")).toBe(original);
  const key = pending.metadata.steps[0].id;
  expect(key).toBe("plugin-source-" + "a".repeat(64));
  await runtime.run({ threadId: "takeover-question", runId: "takeover-question-2", messages: [], forwardedProps: { command: { resume: { interruptId: pending.id, answers: { [key]: [choice] } } } } }, context.signal, publish);
  expect(applications).toBe(choice === "approve" ? 1 : 0);
  expect(events.filter(event => event.name === "on_interrupt")).toHaveLength(1);
  expect(await readFile(path.join(context.root, entry), "utf8")).toBe(choice === "approve" ? original.replace("minHeight: 48", "minHeight: 64") + "// owned implementation selected\n" : original);
});
