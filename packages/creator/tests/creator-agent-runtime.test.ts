import { afterEach, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { AIMessage, ToolMessage } from "@langchain/core/messages";
import { RunActivity, restoreTransaction, readTransaction } from "../src/agent/activity.js";
import { creatorContentHash } from "../src/agent/files/creatorFileState.js";
import { CreatorValidation } from "../src/agent/validation.js";
import { recordRuntimeEvidence } from "../src/agent/runtime-evidence.js";
import { regexSearch, matchesGlob } from "../src/agent/search.js";
import { CreatorAgentRuntime } from "../src/agent/runner.js";
import { requestOperator } from "../src/agent/operator.js";

const mock = vi.hoisted(() => ({ model: undefined as any, summaryModel: undefined as any }));
vi.mock("../src/agent/config.js", () => ({ hostEnvironment: () => ({ CREATOR_AGENT_MODE: "domain-write", CREATOR_VERIFICATION_MODE: "static_only" }), createModel: (_environment: unknown, thread: string) => thread.includes(":summary:") && mock.summaryModel ? mock.summaryModel : mock.model }));
const roots: string[] = [];
afterEach(async () => { mock.summaryModel = undefined; for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
async function project() {
  const root = await mkdtemp(path.join(tmpdir(), "creator TS 中文 ")); roots.push(root);
  await mkdir(path.join(root, ".agent-ui")); await mkdir(path.join(root, "src")); await mkdir(path.join(root, "skills"));
  await writeFile(path.join(root, ".agent-ui/project.json"), JSON.stringify({ sourceRoot: "src" }));
  await writeFile(path.join(root, "src/readme.txt"), Array.from({ length: 100 }, (_, index) => `line ${index}`).join("\n"));
  return root;
}
class ScriptedModel extends BaseChatModel {
  calls = 0;
  prompts: any[][] = [];
  constructor(readonly answer: (index: number) => AIMessage) { super({}); }
  _llmType() { return "creator-regression"; }
  bindTools() { return this; }
  async _generate(messages: any[]) { this.prompts.push(messages); return { generations: [{ text: "", message: this.answer(this.calls++) }] }; }
}
const call = (name: string, args: object, id: string) => new AIMessage({ content: "", tool_calls: [{ name, args, id, type: "tool_call" }] });
const contracts = fileURLToPath(new URL("../contracts/creator", import.meta.url));
it("returns a disabled group's tool error and continues after explicit tool expansion", async () => {
  const root = await project();
  const model = mock.model = new ScriptedModel(index => {
    if (index === 0) return call("inspect_creator_transactions", {}, "unavailable-history");
    if (index === 1) {
      const result = model.prompts.at(-1)!.find(message => ToolMessage.isInstance(message) && message.tool_call_id === "unavailable-history");
      expect(JSON.parse(result.content)).toMatchObject({ ok: false, error: { code: "CREATOR_TOOL_NOT_AVAILABLE", reason: "tool_group_not_enabled", recovery: { tool: "enable_creator_tools", groups: ["history"] } } });
      return call("enable_creator_tools", { groups: ["history"] }, "enable-history");
    }
    if (index === 2) return call("inspect_creator_transactions", {}, "available-history");
    const result = model.prompts.at(-1)!.find(message => ToolMessage.isInstance(message) && message.tool_call_id === "available-history");
    expect(JSON.parse(result.content).ok).toBe(true);
    return new AIMessage("History inspected.");
  });
  const runtime = new CreatorAgentRuntime(root, path.join(root, "skills"), contracts), events: any[] = [];
  await runtime.run({ threadId: "tool-expansion", runId: "tool-expansion-1", messages: [{ role: "user", content: "只读检查历史记录" }] }, new AbortController().signal, async event => { events.push(event); });
  expect(events.some(event => event.type === "RUN_ERROR")).toBe(false);
  expect(events.at(-1)).toMatchObject({ type: "RUN_FINISHED" });
  expect(events.filter(event => event.type === "TOOL_CALL_START").map(event => event.toolCallId)).toEqual(["unavailable-history", "enable-history", "available-history"]);
});
it("returns a recoverable read-only denial without editing the file", async () => {
  const root = await project(), before = await readFile(path.join(root, "src/readme.txt"), "utf8");
  const model = mock.model = new ScriptedModel(index => {
    if (index === 0) return call("edit_file", { file_path: "/src/readme.txt", old_string: "line 0", new_string: "changed" }, "denied-edit");
    if (index === 1) {
      const result = model.prompts.at(-1)!.find(message => ToolMessage.isInstance(message) && message.tool_call_id === "denied-edit");
      expect(JSON.parse(result.content)).toMatchObject({ ok: false, error: { code: "TOOL_PERMISSION_DENIED", reason: "read_only_request" } });
      return call("read_file", { file_path: "/src/readme.txt", limit: 1 }, "allowed-read");
    }
    return new AIMessage("Inspection only.");
  });
  const runtime = new CreatorAgentRuntime(root, path.join(root, "skills"), contracts), events: any[] = [];
  await runtime.run({ threadId: "read-only-tool", runId: "read-only-tool-1", messages: [{ role: "user", content: "只读检查文件" }] }, new AbortController().signal, async event => { events.push(event); });
  expect(await readFile(path.join(root, "src/readme.txt"), "utf8")).toBe(before);
  expect(events.some(event => event.type === "RUN_ERROR")).toBe(false);
  expect(events.at(-1)).toMatchObject({ type: "RUN_FINISHED" });
});
it.each([
  "你能帮我做些什么？",
  "你能做什么？",
  "可以帮我们做点什么？",
  "Creator支持哪些功能？",
])("answers capability questions read-only without mutation evidence or completion retries: %s", async request => {
  const root = await project(); const before = await readFile(path.join(root, "src/readme.txt"), "utf8");
  mock.model = new ScriptedModel(() => new AIMessage("I can explain, inspect and customize your Agent UI."));
  const runtime = new CreatorAgentRuntime(root, path.join(root, "skills"), contracts), events: any[] = [];
  await runtime.run({ threadId: "capabilities", runId: "capabilities-1", messages: [{ role: "user", content: request }] }, new AbortController().signal, async event => { events.push(event); });
  expect(await readFile(path.join(root, "src/readme.txt"), "utf8")).toBe(before);
  expect(events.filter(event => event.type === "TOOL_CALL_START")).toHaveLength(0);
  expect(events.at(-1)).toMatchObject({ type: "RUN_FINISHED", result: { completion: "success", executionPolicy: "read-only", toolProtocol: { modelCalls: 1, toolCalls: 0 } } });
});
it.each([
  "帮我检查刚才改的地方。工具成功、失败和需要我确认时，都能正常显示吗？哪些已经检查过，哪些还需要我在页面上试？",
  "请核对刚才改过的界面，能正常显示吗？",
  "帮我看看现在界面上都有什么，不用修改。",
  "帮我看看现在界面上都有什么，不需要修改。",
  "帮我看看现在界面上都有什么，无需修改。",
])("keeps inspection of past edits read-only and completes without mutation evidence: %s", async request => {
  const root = await project(); const before = await readFile(path.join(root, "src/readme.txt"), "utf8");
  mock.model = new ScriptedModel(index => index === 0 ? call("read_file", { file_path: "/src/readme.txt" }, "review-read") : new AIMessage("Inspection complete; no files changed."));
  const runtime = new CreatorAgentRuntime(root, path.join(root, "skills"), contracts), events: any[] = [];
  await runtime.run({ threadId: "review", runId: "review-1", messages: [{ role: "user", content: request }] }, new AbortController().signal, async event => { events.push(event); });
  expect(await readFile(path.join(root, "src/readme.txt"), "utf8")).toBe(before);
  expect(events.filter(event => event.type === "TOOL_CALL_START").map(event => event.toolCallName)).toEqual(["read_file"]);
  expect(events.at(-1)).toMatchObject({ type: "RUN_FINISHED", result: { completion: "success", executionPolicy: "read-only", toolProtocol: { modelCalls: 2 } } });
});
it.each(["帮我检查当前界面并修复错误", "检查后把输入框挪到右边", "你能做什么？然后把名称改成小招。", "不用修改其他文件，把名称改成小招。",
  "请直接实施修改，只改 application/shell/PlatformShell.tsx，添加 data-testid。不要接管源码、初始化工程或修改 Runtime/framework。",
  "修改项目 Shell。不要修改 framework/contracts 或 vendor/source。",
  "Edit the project Shell. Do not edit runtime/framework.",
])("keeps explicit follow-up edits on the normal permission route: %s", async request => {
  const root = await project();
  mock.model = new ScriptedModel(index => index === 0 ? new AIMessage('{"permission":"domain_write"}') : call("ask_user_question", { steps: [{ id: "scope", question: "Which area?", options: [{ id: "input", label: "Input" }, { id: "sidebar", label: "Sidebar" }], selectionMode: "single", minSelections: 1, maxSelections: 1 }] }, "scope"));
  const runtime = new CreatorAgentRuntime(root, path.join(root, "skills"), contracts), events: any[] = [];
  await runtime.run({ threadId: "review-edit", runId: "review-edit-1", messages: [{ role: "user", content: request }] }, new AbortController().signal, async event => { events.push(event); });
  expect(events.find(event => event.type === "STEP_FINISHED" && event.stepName === "creator.resolve").metadata.executionPolicy).toBe("domain-write");
  expect(events.at(-1)).toMatchObject({ type: "RUN_FINISHED", result: { completion: "needs_user_input" } });
});
it.each(["只读检查 Shell，不要修改 Runtime/framework。", "不要修改任何文件，包括 runtime/framework。", "Read-only inspection. Do not edit runtime/framework."])("retains global read-only restrictions around protected paths: %s", async request => {
  const root = await project();
  mock.model = new ScriptedModel(() => new AIMessage("Inspection only; no changes."));
  const runtime = new CreatorAgentRuntime(root, path.join(root, "skills"), contracts), events: any[] = [];
  await runtime.run({ threadId: "protected-inspection", runId: "protected-inspection-1", messages: [{ role: "user", content: request }] }, new AbortController().signal, async event => { events.push(event); });
  expect(events.at(-1)).toMatchObject({ type: "RUN_FINISHED", result: { executionPolicy: "read-only", toolProtocol: { modelCalls: 1 } } });
});
it("repairs textual tool markup in content blocks without executing it as a tool", async () => {
  const root = await project();
  mock.model = new ScriptedModel(index => index === 0 ? new AIMessage({ content: [{ type: "text", text: '<tool_call><function=read_file>fake markup</function></tool_call>' }] }) : index === 1 ? call("read_file", { file_path: "/src/readme.txt" }, "native-read") : new AIMessage("done"));
  const runtime = new CreatorAgentRuntime(root, path.join(root, "skills"), contracts), events: any[] = [];
  await runtime.run({ threadId: "protocol", runId: "protocol-1", messages: [{ role: "user", content: "只读检查文件" }] }, new AbortController().signal, async event => { events.push(event); });
  expect(events.filter(event => event.type === "TOOL_CALL_START")).toHaveLength(1);
  expect(events.at(-1)).toMatchObject({ type: "RUN_FINISHED", result: { completion: "success", toolProtocol: { modelCalls: 3 } } });
});
it("rejects a mixed tool batch before executing any of its calls", async () => {
  const root = await project();
  mock.model = new ScriptedModel(index => index === 0 ? new AIMessage({ content: "", tool_calls: [
    { name: "enable_creator_tools", args: { groups: ["history"] }, id: "rejected-enable", type: "tool_call" },
    { name: "read_file", args: { file_path: "/src/readme.txt" }, id: "rejected-read", type: "tool_call" },
  ] }) : index === 1 ? call("read_file", { file_path: "/src/readme.txt" }, "accepted-read") : new AIMessage("done"));
  const runtime = new CreatorAgentRuntime(root, path.join(root, "skills"), contracts), events: any[] = [];
  await runtime.run({ threadId: "batch", runId: "batch-1", messages: [{ role: "user", content: "只读检查文件" }] }, new AbortController().signal, async event => { events.push(event); });
  expect(events.filter(event => event.type === "TOOL_CALL_START").map(event => event.toolCallId)).toEqual(["accepted-read"]);
  expect(events.at(-1)).toMatchObject({ type: "RUN_FINISHED", result: { completion: "success", toolProtocol: { modelCalls: 3, toolCalls: 1 } } });
  expect(mock.model.prompts[2].some((message: any) => typeof message.content === "string" && message.content.includes("The rejected calls were:"))).toBe(false);
}, 5000);
it("explains that build validation is exclusive and never executes the rejected validation batch", async () => {
  const root = await project();
  const model = mock.model = new ScriptedModel(index => index === 0 ? new AIMessage({ content: "", tool_calls: [
    { name: "read_file", args: { file_path: "/src/readme.txt" }, id: "rejected-read", type: "tool_call" },
    { name: "validate_creator_changes", args: { includeBuild: true }, id: "rejected-build", type: "tool_call" },
  ] }) : index === 1 ? call("read_file", { file_path: "/src/readme.txt" }, "accepted-read") : new AIMessage("Inspection done."));
  const runtime = new CreatorAgentRuntime(root, path.join(root, "skills"), contracts), events: any[] = [];
  await runtime.run({ threadId: "build-batch", runId: "build-batch-1", messages: [{ role: "user", content: "只读检查文件" }] }, new AbortController().signal, async event => { events.push(event); });
  expect(events.filter(event => event.type === "TOOL_CALL_START").map(event => event.toolCallId)).toEqual(["accepted-read"]);
  expect(model.prompts[1]?.some(message => typeof message.content === "string" && message.content.includes("includeBuild: true must be called alone"))).toBe(true);
  expect(events.at(-1)).toMatchObject({ type: "RUN_FINISHED", result: { completion: "success" } });
});
it("continues progressing beyond the LangGraph default step limit", async () => {
  const root = await project();
  mock.model = new ScriptedModel(index => index < 30 ? call("read_file", { file_path: "/src/readme.txt", offset: index, limit: 1 }, `read-${index}`) : new AIMessage("done"));
  const runtime = new CreatorAgentRuntime(root, path.join(root, "skills"), contracts);
  const events: any[] = [];
  await runtime.run({ threadId: "long", runId: "long-1", messages: [{ role: "user", content: "只读检查文件" }] }, new AbortController().signal, async event => { events.push(event); });
  expect(mock.model.calls).toBe(31);
  expect(events.at(-1)).toMatchObject({ type: "RUN_FINISHED", result: { completion: "success", toolProtocol: { modelCalls: 31, toolCalls: 30 } } });
});
it("stops repeated unchanged reads even when their recovery telemetry changes", async () => {
  const root = await project();
  mock.model = new ScriptedModel(index => index < 12
    ? call("read_file", { file_path: "/src/readme.txt", offset: 0, limit: 100 }, `repeat-${index}`)
    : new AIMessage("done"));
  const runtime = new CreatorAgentRuntime(root, path.join(root, "skills"), contracts);
  await expect(runtime.run({ threadId: "unchanged", runId: "unchanged-1", messages: [{ role: "user", content: "只读检查文件" }] }, new AbortController().signal, async () => {})).rejects.toThrow("CREATOR_NO_PROGRESS");
  expect(mock.model.calls).toBeLessThan(12);
});
it("reads offloaded snapshots in parallel and after interrupt/resume without trimming the real checkpoint", async () => {
  const root = await project(); const source = Array.from({ length: 120 }, (_, i) => `${i} ${"source ".repeat(150)}`).join("\n");
  await writeFile(path.join(root, "src/large.txt"), source); let artifactId = "";
  mock.summaryModel = new ScriptedModel(() => { throw new Error("Offload should avoid summary model calls"); });
  const model: ScriptedModel = new ScriptedModel(index => {
    if (index === 0) return call("read_file", { file_path: "/src/large.txt" }, "offload-read");
    if (index === 1) {
      for (const message of model.prompts.at(-1) ?? []) { try { const value = JSON.parse(typeof message.content === "string" ? message.content : message.content.map((x: any) => x.text ?? "").join("")); if (value.archived) artifactId = value.artifactId; } catch {} }
      expect(artifactId).toMatch(/^ctx-/u);
      return new AIMessage({ content: "", tool_calls: [...[0, 500].map((offset, i) => ({ name: "read_creator_context", args: { artifactId, path: ["result"], offset, limit: 500 }, id: `archive-page-${i}`, type: "tool_call" as const })),
        { name: "read_creator_context", args: { artifactId: "list" }, id: "archive-index", type: "tool_call" }] });
    }
    if (index === 2) {
      const response = model.prompts.at(-1)!.find(message => ToolMessage.isInstance(message) && message.tool_call_id === "archive-index")!;
      const indexResult = JSON.parse(response.content as string).result;
      expect(indexResult).toMatchObject({ kind: "artifact-index", historical: true, grantsFreshness: false });
      expect(JSON.parse(indexResult.content)).toContainEqual({ artifactId, originalTool: "read_file", sourcePath: "/src/large.txt" });
      return call("ask_user_question", { steps: [{ id: "continue", question: "Continue inspection?", options: [{ id: "yes", label: "Yes" }, { id: "no", label: "No" }], selectionMode: "single", minSelections: 1, maxSelections: 1 }] }, "archive-question");
    }
    if (index === 3) return call("read_creator_context", { artifactId, path: ["result"], offset: 1000, limit: 500 }, "archive-after-resume");
    return new AIMessage("Historical inspection finished; no changes.");
  });
  mock.model = model; const runtime = new CreatorAgentRuntime(root, path.join(root, "skills"), contracts);
  Object.assign(runtime.environment, { CREATOR_CONTEXT_MAX_TOKENS: "32768", CREATOR_CONTEXT_KEEP_TOKENS: "4000", CREATOR_MODEL_MAX_TOKENS: "512" });
  const messages = [{ role: "user", content: "只读查看文件，随后问我是否继续，不要修改。" }]; const events: any[] = []; const publish = async (e: any) => { events.push(e); };
  await runtime.run({ threadId: "offload", runId: "offload-1", messages }, new AbortController().signal, publish);
  const pending = runtime.pending.get("offload")!; const snapshot = await pending.graph.getState({ configurable: { thread_id: "offload" } });
  expect(snapshot.values.messages.some((m: any) => m.type === "tool" && JSON.stringify(m.content).includes("source source source") && !String(m.content).includes('"archived":true'))).toBe(true);
  await runtime.run({ threadId: "offload", runId: "offload-2", messages, forwardedProps: { command: { resume: { interruptId: pending.envelope.id, answers: { continue: ["yes"] } } } } }, new AbortController().signal, publish);
  expect(events.filter(e => e.type === "TOOL_CALL_START" && e.toolCallName === "read_creator_context")).toHaveLength(4);
  expect(events.at(-1)).toMatchObject({ type: "RUN_FINISHED", result: { completion: "success", contextCompression: { summaryModelCalls: 0, offloadedArtifacts: 1 } } });
  expect(await readFile(path.join(root, "src/large.txt"), "utf8")).toBe(source);
});
it.each([1800, 7000])("keeps full interrupt checkpoints and internal summaries out of AG-UI while resuming compressed work (%s repeats)", async repeats => {
  const root = await project();
  mock.summaryModel = new ScriptedModel(() => new AIMessage("INTERNAL_SUMMARY_ONLY: inspected historical material. Never modify vendor. Remaining: ask the user and finish inspection."));
  mock.model = new ScriptedModel(index => index === 0 ? call("ask_user_question", { steps: [{ id: "choice", question: "Choose", options: [{ id: "yes", label: "Yes" }, { id: "no", label: "No" }], selectionMode: "single", minSelections: 1, maxSelections: 1 }] }, "compressed-question") : new AIMessage("Inspection finished without edits."));
  const runtime = new CreatorAgentRuntime(root, path.join(root, "skills"), contracts);
  Object.assign(runtime.environment, { CREATOR_CONTEXT_MAX_TOKENS: "16000", CREATOR_CONTEXT_KEEP_TOKENS: "1000", CREATOR_MODEL_MAX_TOKENS: "512" });
  const messages = [{ role: "assistant", content: "Historical observation ".repeat(repeats) }, { role: "user", content: "只读提问，禁止修改 vendor。" }];
  const events: any[] = []; const publish = async (event: any) => { events.push(event); };
  await runtime.run({ threadId: "compressed", runId: "compressed-1", messages }, new AbortController().signal, publish);
  expect(mock.summaryModel.calls).toBeGreaterThan(0);
  const pending = runtime.pending.get("compressed")!;
  const snapshot = await pending.graph.getState({ configurable: { thread_id: "compressed" } });
  expect(snapshot.values.messages.some((m: any) => m.content === messages[0]!.content)).toBe(true);
  await runtime.run({ threadId: "compressed", runId: "compressed-2", messages, forwardedProps: { command: { resume: { interruptId: pending.envelope.id, answers: { choice: ["yes"] } } } } }, new AbortController().signal, publish);
  expect(events.filter(e => e.type === "TEXT_MESSAGE_CONTENT").map(e => e.delta).join("")).not.toContain("INTERNAL_SUMMARY_ONLY");
  expect(mock.model.prompts.at(-1)?.some((m: any) => String(m.content).includes("禁止修改 vendor"))).toBe(true);
  expect(events.at(-1)).toMatchObject({ type: "RUN_FINISHED", result: { completion: "success", contextCompression: { compactions: 1, summaryModelCalls: mock.summaryModel.calls } } });
});
it("resumes the exact paused question and rejects an unrelated interrupt", async () => {
  const root = await project();
  mock.model = new ScriptedModel(index => index === 0 ? call("ask_user_question", { steps: [{ id: "choice", question: "Choose", options: [{ id: "yes", label: "Yes" }, { id: "no", label: "No" }], selectionMode: "single", minSelections: 1, maxSelections: 1 }] }, "question") : new AIMessage("answered"));
  const runtime = new CreatorAgentRuntime(root, path.join(root, "skills"), contracts);
  const events: any[] = [], publish = async (event: any) => { events.push(event); };
  await runtime.run({ threadId: "question", runId: "q-1", messages: [{ role: "user", content: "只读提问" }] }, new AbortController().signal, publish);
  const interrupt = events.find(event => event.type === "CUSTOM" && event.name === "on_interrupt");
  expect(interrupt.value.metadata.steps[0].id).toBe("choice");
  await expect(runtime.run({ threadId: "question", runId: "q-2", messages: [], forwardedProps: { command: { resume: { interruptId: "unrelated", answers: { choice: ["yes"] } } } } }, new AbortController().signal, publish)).rejects.toThrow("CREATOR_INTERRUPT_NOT_FOUND");
  await runtime.run({ threadId: "question", runId: "q-3", messages: [], forwardedProps: { command: { resume: { interruptId: interrupt.value.id, answers: { choice: ["yes"] } } } } }, new AbortController().signal, publish);
  expect(runtime.pending.size).toBe(0); expect(events.at(-1)).toMatchObject({ type: "RUN_FINISHED", result: { completion: "success" } });
  expect(events.at(-1).result.toolProtocol.modelCalls).toBe(2);
});
it("retries a failed query after new evidence without treating it as a stuck loop", async () => {
  const root = await project();
  mock.model = new ScriptedModel(index => index >= 16 ? new AIMessage("done") : index % 4 === 3 ? call("read_file", { file_path: "/src/readme.txt", offset: Math.floor(index / 4), limit: 1 }, `evidence-${index}`) : call("read_file", { file_path: "/src/missing.txt" }, `missing-${index}`));
  const runtime = new CreatorAgentRuntime(root, path.join(root, "skills"), contracts), events: any[] = [];
  await runtime.run({ threadId: "evidence", runId: "evidence-1", messages: [{ role: "user", content: "只读检查文件" }] }, new AbortController().signal, async event => { events.push(event); });
  expect(events.at(-1)).toMatchObject({ type: "RUN_FINISHED", result: { completion: "success", toolProtocol: { modelCalls: 17, toolCalls: 16 } } });
});
it("steers repeated protected reads to another evidence route across tools without ending useful work", async () => {
  const root = await project();
  mock.model = new ScriptedModel(index => [
    call("read_file", { file_path: "/node_modules/package/public.d.ts" }, "denied-read"),
    call("read_file", { file_path: "/src/readme.txt" }, "unrelated-evidence"),
    call("grep", { path: "/node_modules/another", pattern: "PublicType" }, "denied-search"),
    call("read_file", { file_path: "/src/readme.txt", offset: 1, limit: 1 }, "allowed-route"),
    new AIMessage("The package directory is protected; project evidence was inspected."),
  ][index]!);
  const runtime = new CreatorAgentRuntime(root, path.join(root, "skills"), contracts), events: any[] = [];
  await runtime.run({ threadId: "recovery", runId: "recovery-1", messages: [{ role: "user", content: "只读检查文件" }] }, new AbortController().signal, async event => { events.push(event); });
  expect(events.at(-1)).toMatchObject({ type: "RUN_FINISHED", result: { completion: "success", toolProtocol: { modelCalls: 5 } } });
  const logs = await import("node:fs/promises").then(fs => fs.readdir(path.join(root, ".agent-ui/creator/logs")));
  const entries = (await readFile(path.join(root, ".agent-ui/creator/logs", logs[0]!), "utf8")).split("\n").filter(Boolean).map(line => JSON.parse(line));
  expect(entries.filter(entry => entry.event === "tool_finished" && entry.code === "TOOL_PERMISSION_DENIED")).toHaveLength(2);
  expect(entries.find(entry => entry.event === "evidence_route_recovery")).toMatchObject({ recovery: { repeatedFailure: true, attempts: 2 } });
});
it("queues parallel project reads through the Operator lock", async () => {
  const root = await project(); await mkdir(path.join(root, ".agent-ui/operator"));
  await writeFile(path.join(root, ".agent-ui/operator/entry.mjs"), `import fs from 'node:fs/promises';
    try { await fs.writeFile('.test-operator-lock','locked',{flag:'wx'}); }
    catch { process.stdout.write(JSON.stringify({ok:false,error:{code:'OPERATOR_BUSY',message:'busy'}}));process.exit(1); }
    await new Promise(resolve=>setTimeout(resolve,30));await fs.unlink('.test-operator-lock');
    process.stdout.write(JSON.stringify({ok:true,result:{appUIModelHash:'a'.repeat(64),services:[],plugins:[],issues:[]}}));`);
  const results = await Promise.all(Array.from({ length: 4 }, () => requestOperator(root, "inspect_ui_services")));
  expect(results).toHaveLength(4); expect(results.every(result => result.appUIModelHash === "a".repeat(64))).toBe(true);
});
it("does not turn an explicit undo into read-only because other files are excluded", async () => {
  const root = await project(), original = await readFile(path.join(root, "src/readme.txt"), "utf8");
  const saved = new RunActivity(root, "previous-run", new AbortController().signal);
  await saved.capture("src/readme.txt"); await writeFile(path.join(root, "src/readme.txt"), "changed"); saved.recordAfter("src/readme.txt", { exists: true, hash: creatorContentHash("changed"), content: "changed" }); saved.revision++; await saved.persist();
  const digest = creatorContentHash(JSON.stringify(await readTransaction(root, "previous-run")));
  mock.model = new ScriptedModel(index => [
    new AIMessage('{"permission":"domain_write"}'),
    call("enable_creator_tools", { groups: ["history"] }, "history"),
    call("inspect_creator_transaction", { run_id: "previous-run" }, "inspect"),
    call("undo_creator_run", { run_id: "previous-run", transaction_id: digest, requested_paths: ["src/readme.txt"] }, "undo"),
    new AIMessage("undone"),
  ][index]!);
  const runtime = new CreatorAgentRuntime(root, path.join(root, "skills"), contracts), events: any[] = [];
  await runtime.run({ threadId: "undo", runId: "undo-request", messages: [{ role: "user", content: "请撤销 previous-run 的整轮修改；不要撤销其他运行或改动其他文件。" }] }, new AbortController().signal, async event => { events.push(event); });
  expect(await readFile(path.join(root, "src/readme.txt"), "utf8")).toBe(original);
  expect(events.at(-1)).toMatchObject({ type: "RUN_FINISHED", result: { completion: "success", executionPolicy: "domain-write" } });
});
it("preflights every undo file and preserves a later manual edit", async () => {
  const root = await project(), activity = new RunActivity(root, "undo", new AbortController().signal);
  for (const name of ["src/a.ts", "src/b.ts"]) { await writeFile(path.join(root, name), "before"); await activity.capture(name); await writeFile(path.join(root, name), "after"); activity.recordAfter(name, { exists: true, hash: creatorContentHash("after"), content: "after" }); }
  activity.revision++; await activity.persist();
  await writeFile(path.join(root, "src/b.ts"), "manual");
  await expect(restoreTransaction(root, "undo", "undo")).rejects.toThrow("CREATOR_UNDO_CONFLICT");
  expect(await readFile(path.join(root, "src/a.ts"), "utf8")).toBe("after");
  expect(await readFile(path.join(root, "src/b.ts"), "utf8")).toBe("manual");
});
it.each(["after", "manual"])("recovers a partly applied multi-file command without overwriting %s state", async remaining => {
  const root = await project(), activity = new RunActivity(root, "partial-command", new AbortController().signal);
  for (const name of ["src/界面 a.ts", "src/b.ts"]) {
    await writeFile(path.join(root, name), "before"); await activity.capture(name);
    await writeFile(path.join(root, name), "after"); activity.recordAfter(name, { exists: true, hash: creatorContentHash("after"), content: "after" });
  }
  activity.revision = 2; await activity.persist();
  await writeFile(path.join(root, "src/界面 a.ts"), "before");
  await writeFile(path.join(root, "src/b.ts"), remaining);
  await expect(restoreTransaction(root, activity.runId, "undo")).rejects.toThrow("CREATOR_UNDO_CONFLICT");
  const recovery = restoreTransaction(root, activity.runId, "undo", undefined, { allowPartialUndo: true });
  if (remaining === "manual") await expect(recovery).rejects.toThrow("CREATOR_UNDO_CONFLICT");
  else {
    expect(await recovery).toMatchObject({ status: "undone", changedPaths: ["src/b.ts"] });
    await restoreTransaction(root, activity.runId, "reapply");
    expect(await readFile(path.join(root, "src/界面 a.ts"), "utf8")).toBe("after");
  }
  expect(await readFile(path.join(root, "src/b.ts"), "utf8")).toBe(remaining);
});
it("does not absorb a manual edit made after the Agent commit into its undo baseline", async () => {
  const root = await project(), activity = new RunActivity(root, "manual-after-commit", new AbortController().signal);
  await activity.capture("src/readme.txt"); await writeFile(path.join(root, "src/readme.txt"), "agent");
  activity.recordAfter("src/readme.txt", { exists: true, hash: creatorContentHash("agent"), content: "agent" }); activity.revision++;
  await writeFile(path.join(root, "src/readme.txt"), "human");
  const receipt = await activity.persist();
  expect(receipt.transaction.undoable).toBe(false); expect(receipt.transaction.conflicts).toHaveLength(1);
  expect((await readTransaction(root, activity.runId)).files[0]!.after.content).toBe("agent");
  await expect(restoreTransaction(root, activity.runId, "undo")).rejects.toThrow("CREATOR_UNDO_CONFLICT");
  await expect(activity.capture("src/readme.txt")).rejects.toThrow("CREATOR_RUN_FILE_CHANGED_EXTERNALLY");
  expect(await readFile(path.join(root, "src/readme.txt"), "utf8")).toBe("human");
});
it("records only the Operator's declared changed paths when an unrelated file changes", async () => {
  const root = await project(), activity = new RunActivity(root, "operator-footprint", new AbortController().signal);
  const snapshot = await activity.captureSource();
  await writeFile(path.join(root, "src/readme.txt"), "human"); await writeFile(path.join(root, "src/created.ts"), "export {};\n");
  await activity.observeOperatorChanges(snapshot, { changedPaths: ["src/created.ts"] });
  const receipt = await activity.persist(); expect(receipt.files.map(file => file.path)).toEqual(["src/created.ts"]);
  await restoreTransaction(root, activity.runId, "undo");
  expect(await readFile(path.join(root, "src/readme.txt"), "utf8")).toBe("human");
});
it("persists committed files before a question and preserves subsequent edits on abandon", async () => {
  const root = await project();
  const baseline = vi.spyOn(CreatorValidation.prototype, "ensureBaseline").mockResolvedValue({ staticErrors: new Set(), typeErrors: new Set(), typeCheck: { command: "typecheck", status: "passed", exitCode: 0, output: "", truncated: false, revision: 0 } });
  try {
    mock.model = new ScriptedModel(index => [new AIMessage('{"permission":"domain_write"}'),
      call("create_ui_source_file", { path: "/src/probe.ts", content: "export const probe = 1;" }, "create"),
      call("ask_user_question", { steps: [{ id: "choice", question: "Continue?", options: [{ id: "yes", label: "Yes" }, { id: "no", label: "No" }], selectionMode: "single", minSelections: 1, maxSelections: 1 }] }, "pause"),
    ][index]!);
    const runtime = new CreatorAgentRuntime(root, path.join(root, "skills"), contracts), events: any[] = [];
    await runtime.run({ threadId: "pause-write", runId: "pause-write-1", messages: [{ role: "user", content: "请创建文件并提问" }] }, new AbortController().signal, async event => { events.push(event); });
    expect(events.at(-1)).toMatchObject({ type: "RUN_FINISHED", result: { completion: "needs_user_input", receipt: { transaction: { undoable: true } } } });
    const interrupt = events.find(event => event.type === "CUSTOM" && event.name === "on_interrupt");
    expect((await readTransaction(root, "pause-write-1")).files[0]!.after.content).toBe("export const probe = 1;");
    await writeFile(path.join(root, "src/probe.ts"), "human"); await runtime.abandon("pause-write", interrupt.value.id);
    await expect(restoreTransaction(root, "pause-write-1", "undo")).rejects.toThrow("CREATOR_UNDO_CONFLICT");
    expect(await readFile(path.join(root, "src/probe.ts"), "utf8")).toBe("human");
  } finally { baseline.mockRestore(); }
});
it("keeps separate runtime failures and rejects out-of-order resolution", () => {
  const store = new Map(), now = new Date().toISOString();
  const report = (kind: string, status: string, occurredAt = now) => ({ threadId: "runtime", diagnostic: { kind, status, appUIModelHash: "a".repeat(64), pluginId: "test", instanceId: "instance", errorMessage: "failure", occurredAt } });
  recordRuntimeEvidence(store, report("plugin-render", "error")); recordRuntimeEvidence(store, report("plugin-activation", "error"));
  recordRuntimeEvidence(store, report("plugin-render", "resolved", new Date(Date.now() - 1000).toISOString()));
  expect([...store.values()].filter(value => value.diagnostic.status === "error")).toHaveLength(2);
});
it("supports portable globs and terminates pathological regular expressions", async () => {
  expect(matchesGlob("src/应用/index.tsx", "src/**/*.{ts,tsx}")).toBe(true);
  expect(matchesGlob("src/x.ts", "**/*.tsx")).toBe(false);
  await expect(regexSearch([{ path: "source.ts", content: "a".repeat(40000) + "!" }], "(a+)+$", new AbortController().signal)).rejects.toThrow("CREATOR_REGEX_TIMEOUT");
}, 3000);
