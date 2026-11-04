import { afterEach, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { RunActivity } from "../src/agent/activity.js";
import { prepareDevelopment } from "../src/agent/development-tools.js";
import { applyService, prepareService } from "../src/agent/service-tools.js";
import { createPlugin } from "../src/agent/source-tools.js";
import { readProjectFile } from "../src/agent/project-read.js";
import { createTools, visibleTool, type ToolContext } from "../src/agent/tools.js";
import { agentMessages } from "../src/agent/messages.js";
import { workingContext } from "../src/agent/working-context.js";
const state = vi.hoisted(() => ({ answer: undefined as string | undefined, questions: [] as any[], services: [] as any[] }));
vi.mock("@langchain/langgraph", async original => ({ ...await original<any>(), interrupt: (payload: any) => {
  state.questions.push(payload);
  if (!state.answer) throw new Error("Awaiting user");
  return { answers: { [payload.steps[0].id]: [state.answer] } };
} }));
vi.mock("../src/agent/operator.js", async original => ({ ...await original<any>(), requestOperator: async (_root: string, name: string) => name === "list_ui_plugins" ? { pluginAssets: [{ pluginId: "card" }] } : { services: state.services } }));
const roots: string[] = [];
afterEach(async () => { state.answer = undefined; state.questions = []; state.services = []; for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), "Creator 方案 中文 ")); roots.push(root);
  const file = "src/界面/plugins/card/index.tsx";
  await mkdir(path.join(root, ".agent-ui")); await mkdir(path.dirname(path.join(root, file)), { recursive: true });
  await writeFile(path.join(root, ".agent-ui/project.json"), '{"sourceRoot":"src/界面"}');
  await writeFile(path.join(root, file), "export const Card = () => null;\n");
  await writeFile(path.join(root, "src/界面/plugins/card/definition.ts"), "export default {};\n");
  await writeFile(path.join(root, "src/界面/plugins/card/manifest.json"), '{"id":"card"}');
  const signal = new AbortController().signal;
  const context = { root, threadId: "proposal", userMessage: "添加一个按钮插件，点击收起卡片。", readOnly: false, signal,
    skills: path.join(root, "skills"), contracts: fileURLToPath(new URL("../contracts/creator", import.meta.url)),
    activity: new RunActivity(root, "proposal-run", signal), authorizedPlugins: new Set(), diagnostics: new Map(), groups: new Set(), verificationMode: "static_only",
    editingSelection: { filePaths: [file] }, validation: { ensureBaseline: vi.fn(async () => {}) } } as unknown as ToolContext;
  await readProjectFile(context, { file_path: "/" + file, limit: 120 });
  const service = { changeKind: "create", serviceName: "help.card", contractPath: "services/help-card.ts", ownerPluginId: "card", consumers: [{ pluginId: "dismiss", dependencyMode: "required" }], reason: "Share collapse state across the card and its action" };
  const input = { targetPluginId: "dismiss", desiredOutcome: "按钮收起卡片，标题重新展开", missingCapabilities: ["Existing card has no collapse control API for a child"], affectedFiles: [file],
    deliveryContract: { capability: "dismiss help", renderingCategory: "semantic-slot", placement: "card.headerActions", lifecycle: "with card", dependencies: ["help.card"], verificationMethod: "runtime" },  };
  return { context, input, service, file };
}
it("offers a concrete joint plan from already read owner code, even for a direct commission, before any write", async () => {
  const { context, input } = await fixture();
  Object.assign(input, { uiScope: "existing controls", dataScope: "local UI state only" });
  expect(visibleTool("prepare_ui_plugin_development", context)).toBe(true);
  const tools = await createTools(context);
  expect(tools.find(t => t.name === "prepare_ui_plugin_development")).toBeDefined();
  await expect(prepareDevelopment(context, input)).rejects.toThrow("Awaiting user");
  expect(state.questions[0].steps[0].options.map((o: any) => o.id)).toEqual(["start", "adjust", "defer"]);
  const text = state.questions[0].steps[0].description;
  expect(text).toContain(input.desiredOutcome); expect(text).toContain("dismiss");
  expect(text).not.toContain("existing controls"); expect(text).not.toContain("local UI state only");
  expect(context.authorizedPlugins.size).toBe(0); expect(context.activity.before.size).toBe(0);
  expect(visibleTool("create_ui_plugin", context)).toBe(false);
  expect(context.toolObservations).toBeUndefined();
});
it("one development answer survives implementation changes and permits supporting code without another question", async () => {
  const { context, input, service } = await fixture(); state.answer = "start";
  const plan = await prepareDevelopment(context, input);
  expect(visibleTool("create_ui_plugin", context)).toBe(true);
  context.groups.clear();
  expect(state.questions).toHaveLength(1);
  input.deliveryContract.dependencies.push("local hook");
  expect((await prepareDevelopment(context, input)).status).toBe("authorized");
  expect(visibleTool("create_ui_plugin", context)).toBe(true);
  expect(state.questions).toHaveLength(1);
  const prepared = await prepareService(context, service);
  expect(prepared.status).toBe("ready");
  expect(state.questions).toHaveLength(1);
  expect(String(workingContext(context, 3000)[0]!.content)).toContain('"confirmedNewPlugins":["dismiss"]');
  await applyService(context, { planId: prepared.planId, content: "export interface HelpCard { collapse(): void; }" }, "create");
  expect(await readFile(path.join(context.root, "src/界面/services/help-card.ts"), "utf8")).toContain("collapse");
  await expect(applyService(context, { planId: "another-service", content: "export {};" }, "create")).rejects.toThrow("PLAN_INVALID");
  await createPlugin(context, { pluginId: "dismiss", files: [
    { relativePath: "manifest.json", content: JSON.stringify({ id: "dismiss", name: "Dismiss", version: "0.0.1" }) },
    { relativePath: "definition.ts", content: "export default {};" }, { relativePath: "index.tsx", content: "export const Dismiss = () => null;" },
  ] });
  expect(await readFile(path.join(context.root, "src/界面/plugins/dismiss/index.tsx"), "utf8")).toContain("Dismiss");
  expect(context.authorizedPlugins.has("other")).toBe(false);
  expect((await prepareDevelopment(context, input)).status).toBe("authorized");
  expect(state.questions).toHaveLength(1);
});
it.each(["adjust", "defer"])("%s leaves Plugin and Service unauthorized and files untouched", async answer => {
  const { context, input } = await fixture(); state.answer = answer;
  expect(await prepareDevelopment(context, input)).toEqual({ status: "declined" });
  expect(context.developmentDecision).toBe(answer); expect(context.authorizedPlugins.size).toBe(0); expect(context.activity.before.size).toBe(0);
  expect(visibleTool("create_ui_plugin", context)).toBe(false);
  await expect(createPlugin(context, { pluginId: "dismiss", files: [] })).rejects.toThrow("AUTHORIZATION_REQUIRED");
});
it("does not turn changing parent source into another development question; writes still check fresh reads", async () => {
  const { context, input, file } = await fixture();
  await expect(prepareDevelopment(context, input)).rejects.toThrow("Awaiting user");
  await writeFile(path.join(context.root, file), "export const Card = () => 'external';"); state.answer = "start";
  // Omit stale advisory source references. The new-Plugin question is the decision,
  // while each actual existing-file edit retains its own file-version guard.
  delete context.editingSelection;
  expect((await prepareDevelopment(context, input)).status).toBe("authorized");
  await createTools(context);
  await expect(context.hostTools!.get("edit_file")!({ file_path: file, old_string: "Card", new_string: "Changed" })).rejects.toThrow();
});
it("rejects using a new-Plugin question for an existing Plugin; its ordinary edits need no question", async () => {
  const { context, input, file } = await fixture();
  state.answer = "start";
  await expect(prepareDevelopment(context, { ...input, targetPluginId: "card", workKind: "extend-capability" })).rejects.toThrow("NEW_ID_REQUIRED");
  await createTools(context);
  await context.hostTools!.get("edit_file")!({ file_path: file, old_string: "null", new_string: "'new interaction'" });
  await context.hostTools!.get("create_ui_source_file")!({ path: "src/界面/hooks/helper.ts", content: "export const helper = 1;" });
  await context.hostTools!.get("create_ui_source_file")!({ path: "src/界面/services/helper.ts", content: "export const helper = 1;" });
  expect(state.questions).toHaveLength(0);
  expect(context.activity.revision).toBe(3);
});
it.each(["src/界面/vendor/source.ts", "src/界面/runtime/source.ts", "../outside.ts"])("does not include protected path %s in a development grant", async file => {
  const { context, input } = await fixture(); input.affectedFiles = [file]; state.answer = "start";
  await createTools(context);
  await expect(context.hostTools!.get("create_ui_source_file")!({ path: file, content: "export {};" })).rejects.toThrow(); expect(state.questions).toHaveLength(0); expect(context.authorizedPlugins.size).toBe(0);
});
it("does not prepare in read-only mode and renders the plan in the Host locale", async () => {
  const { context, input } = await fixture(); context.readOnly = true;
  expect(visibleTool("prepare_ui_plugin_development", context)).toBe(false);
  await expect(prepareDevelopment(context, input)).rejects.toThrow("TOOL_PERMISSION_DENIED");
  context.readOnly = false; context.messages = agentMessages("en-US");
  await expect(prepareDevelopment(context, input)).rejects.toThrow("Awaiting user"); expect(state.questions[0].steps[0].description).toContain("dismiss");
});

it("runs interaction verification on an existing Plugin without a development question", async () => {
  const { context } = await fixture();
  context.validation!.behavior = vi.fn(async (pluginId: string, interactions: string[]) => ({ status: "passed", revision: 0, pluginId, interactions })) as any;
  await createTools(context);
  const result = await context.hostTools!.get("verify_ui_plugin_behavior")!({ pluginId: "card", interactions: ["toggle"] });
  expect(result.status).toBe("passed"); expect(state.questions).toHaveLength(0);
  expect(context.validation!.behavior).toHaveBeenCalledWith("card", ["toggle"]);
  expect(context.authorizedPlugins.size).toBe(0);
});

it("asks with only a new Plugin identity and purpose, then accepts later verification details without another question", async () => {
  const { context } = await fixture(); state.answer = "start";
  const tools = await createTools(context); const confirm = tools.find(tool => tool.name === "prepare_ui_plugin_development")!;
  const input = { targetPluginId: "minimal", desiredOutcome: "在卡片头部新增确认按钮插件" };
  expect(JSON.parse(await confirm.invoke(input))).toMatchObject({ ok: true, result: { status: "authorized" } });
  expect(state.questions).toHaveLength(1); expect(context.pluginPlans!.get("minimal")!.contract).toEqual({});
  await confirm.invoke({ ...input, deliveryContract: { capability: "dismiss", renderingCategory: "semantic-slot", placement: "card.headerActions", lifecycle: "with card", dependencies: [], verificationMethod: "runtime", interactions: ["collapse"] } });
  expect(state.questions).toHaveLength(1); expect(context.pluginPlans!.get("minimal")!.contract.interactions).toEqual(["collapse"]);
});
