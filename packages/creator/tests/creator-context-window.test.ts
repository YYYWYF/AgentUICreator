import { expect, it } from "vitest";
import { AIMessage, HumanMessage, ToolMessage, BaseMessage } from "@langchain/core/messages";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { CreatorContextWindow, estimateMessageTokens } from "../src/agent/context-window.js";

class SummaryModel extends BaseChatModel {
  prompts: BaseMessage[][] = [];
  constructor(private readonly answer = () => new AIMessage("Goal: preserve existing UI and do not edit vendor. Changed src/界面 UI/card.tsx. Remaining: verify interaction; no new authorization.")) { super({}); }
  _llmType() { return "context-summary-fixture"; }
  async _generate(messages: BaseMessage[]) { this.prompts.push(messages); return { generations: [{ text: "", message: this.answer() }] }; }
}
function history(count = 30, start = 0): BaseMessage[] {
  return Array.from({ length: count }, (_, i) => [
    new AIMessage({ content: "", tool_calls: [{ name: "read_file", args: { file_path: `/src/界面 UI/file-${start + i}.tsx` }, id: `call-${start + i}`, type: "tool_call" }] }),
    new ToolMessage({ content: JSON.stringify({ ok: true, path: `/src/界面 UI/file-${start + i}.tsx`, content: "详细源码内容".repeat(100) }), tool_call_id: `call-${start + i}` }),
  ]).flat();
}
function setup(answer?: () => AIMessage, signal = new AbortController().signal, environment: Record<string, string> = {}) {
  const model = new SummaryModel(answer), logs: any[] = [];
  const manager = new CreatorContextWindow({ environment: { CREATOR_CONTEXT_MAX_TOKENS: "6000", CREATOR_CONTEXT_KEEP_TOKENS: "500", CREATOR_MODEL_MAX_TOKENS: "512", ...environment },
    request: "只改卡片，禁止修改 vendor。", model: () => model, signal: () => signal, log: async (event, data) => { logs.push({ event, ...data }); } });
  return { manager, model, logs };
}
function assertPairs(messages: BaseMessage[]) {
  const calls = new Set(messages.flatMap(m => AIMessage.isInstance(m) ? (m.tool_calls ?? []).map(c => c.id) : []));
  for (const m of messages) if (ToolMessage.isInstance(m)) expect(calls.has(m.tool_call_id)).toBe(true);
}
it("reuses native summarization on copies, retains the exact goal and complete checkpoint messages", async () => {
  const { manager, model, logs } = setup(); const original = [new HumanMessage("Old user constraint: preserve existing UI"), ...history()];
  const before = JSON.stringify(original);
  const result = await manager.project(original, []);
  expect(estimateMessageTokens(result)).toBeLessThan(estimateMessageTokens(original) / 2);
  expect(JSON.stringify(original)).toBe(before); expect(original.some(m => !m.id)).toBe(true);
  expect(result.some(m => String(m.content).includes("只改卡片，禁止修改 vendor。"))).toBe(true);
  expect(String(model.prompts[0]?.[0]?.content)).toContain("Old user constraint");
  expect(String(model.prompts[0]?.[0]?.content)).toContain("file-0.tsx");
  expect(logs.find(l => l.event === "context_compaction")).toMatchObject({ compactions: 1, summaryModelCalls: 1 });
  assertPairs(result);
  const summaries = model.prompts.length;
  const cached = await manager.project([...original, new AIMessage("Inspect next result")], []);
  expect(model.prompts).toHaveLength(summaries); expect(cached.at(-1)?.content).toBe("Inspect next result");
});
it("rolls the summary forward, preserves recent pairs and invalidates changed-prefix summaries", async () => {
  const { manager, model } = setup(); const first = [new HumanMessage("First constraint"), ...history()];
  await manager.project(first, []); const firstCount = model.prompts.length; const second = [...first, ...history(30, 30)];
  const result = await manager.project(second, []); expect(model.prompts.length).toBeGreaterThan(firstCount);
  expect(String(model.prompts[firstCount]?.[0]?.content)).toContain("Remaining: verify interaction"); assertPairs(result);
  const secondCount = model.prompts.length;
  second[0] = new HumanMessage("Changed constraint"); await manager.project(second, []);
  expect(model.prompts.length).toBeGreaterThan(secondCount); expect(String(model.prompts[secondCount]?.[0]?.content)).toContain("Changed constraint");
});
it.each([
  () => { throw new Error("summary transport failure"); },
  () => new AIMessage(""),
  () => new AIMessage({ content: "partial summary", response_metadata: { finish_reason: "length" } }),
  () => new AIMessage({ content: "", tool_calls: [{ name: "edit_file", args: {}, id: "unauthorized", type: "tool_call" }] }),
])("retains originals and fails explicitly on invalid summary without caching partial text", async answer => {
  const { manager } = setup(answer); const messages = history(); const before = JSON.stringify(messages);
  await expect(manager.project(messages, [])).rejects.toThrow("CREATOR_CONTEXT_COMPACTION_FAILED");
  expect(JSON.stringify(messages)).toBe(before); expect(manager.stats.compactions).toBe(0);
});
it("propagates cancellation instead of accepting the native middleware's error-string fallback", async () => {
  const controller = new AbortController(); const { manager } = setup(() => { controller.abort(new Error("cancelled")); throw controller.signal.reason; }, controller.signal);
  await expect(manager.project(history(), [])).rejects.toThrow("cancelled"); expect(manager.stats.compactions).toBe(0);
});
it("retries transient summary requests and counts every attempt across bounded prefixes", async () => {
  let attempts = 0;
  const { manager, logs } = setup(() => {
    if (++attempts === 1) throw Object.assign(new Error("connection reset"), { code: "ECONNRESET" });
    return new AIMessage("Historical facts preserved; implementation and interaction checks remain unfinished.");
  });
  const messages = history(), before = JSON.stringify(messages);
  await manager.project(messages, []);
  expect(manager.stats.summaryModelCalls).toBe(manager.stats.compactions + 1);
  expect(manager.stats.summaryModelCalls).toBe(attempts);
  expect(logs.filter(x => x.event === "context_summary_model_retry")).toEqual([expect.objectContaining({ attempt: 1, kind: "fresh" })]);
  expect(JSON.stringify(messages)).toBe(before);
});
it("retries an incomplete summary without accepting it or changing checkpoint messages", async () => {
  let attempts = 0;
  const { manager, logs } = setup(() => ++attempts === 1
    ? new AIMessage({ content: "incomplete summary", response_metadata: { finish_reason: "length" } })
    : new AIMessage("Verified historical source facts; implementation and interaction checks remain unfinished."));
  const messages = history(), before = JSON.stringify(messages);
  const result = await manager.project(messages, []);
  expect(manager.stats.summaryModelCalls).toBe(manager.stats.compactions + 1);
  expect(logs.find(row => row.event === "context_summary_model_retry")).toMatchObject({ kind: "invalid_summary", attempt: 1 });
  expect(JSON.stringify(messages)).toBe(before);
  expect(result.some(message => String(message.content).includes("incomplete summary"))).toBe(false);
  assertPairs(result);
});
it("preserves the underlying timeout after exhausting summary retries without caching a fallback", async () => {
  const timeout = Object.assign(new Error("request timeout"), { name: "TimeoutError" });
  const { manager, logs } = setup(() => { throw timeout; }, undefined, { CREATOR_MODEL_MAX_RETRIES: "1" });
  const messages = history(), before = JSON.stringify(messages);
  await expect(manager.project(messages, [])).rejects.toMatchObject({ message: "CREATOR_CONTEXT_COMPACTION_FAILED", cause: timeout });
  expect(manager.stats.summaryModelCalls).toBe(2); expect(manager.stats.compactions).toBe(0);
  expect(logs.find(x => x.event === "context_compaction_failed")).toMatchObject({ reason: "SUMMARY_MODEL_TIMEOUT", originalMessagesRetained: true });
  expect(JSON.stringify(messages)).toBe(before);
});
it("cancels during summary retry backoff without another provider call", async () => {
  const controller = new AbortController(), timeout = Object.assign(new Error("timeout"), { name: "TimeoutError" });
  const model = new SummaryModel(() => { throw timeout; });
  const manager = new CreatorContextWindow({ environment: { CREATOR_CONTEXT_MAX_TOKENS: "6000", CREATOR_CONTEXT_KEEP_TOKENS: "500", CREATOR_MODEL_MAX_TOKENS: "512" },
    request: "Preserve source and permissions", signal: () => controller.signal, model: () => model,
    log: async event => { if (event === "context_summary_model_retry") controller.abort(new Error("cancelled during retry")); } });
  await expect(manager.project(history(), [])).rejects.toThrow("cancelled during retry");
  expect(manager.stats.summaryModelCalls).toBe(1); expect(manager.stats.compactions).toBe(0);
});
it("accepts standard text content blocks from a provider without treating non-text blocks as summary text", async () => {
  const { manager } = setup(() => new AIMessage({ content: [{ type: "text", text: "Keep vendor unmodified; changes are historical evidence. Verify remaining interaction." }] }));
  const result = await manager.project(history(), []);
  expect(manager.stats.compactions).toBeGreaterThan(0); expect(String(result[0]?.content)).toContain("Keep vendor unmodified");
});
it("bounds summary requests for uneven large tool results", async () => {
  const model = new SummaryModel(); const manager = new CreatorContextWindow({ environment: { CREATOR_MODEL_MAX_TOKENS: "16384" }, request: "preserve vendor", signal: () => new AbortController().signal, model: () => model, log: async () => {} });
  const messages = [new HumanMessage("Historical constraint"), ...history(5)];
  for (let i = 0; i < 4; i++) messages.push(new AIMessage({ content: "", tool_calls: [{ name: "read_file", args: { file_path: `file-${i}` }, id: `uneven-${i}`, type: "tool_call" }] }), new ToolMessage({ tool_call_id: `uneven-${i}`, content: `source-marker-${i}\n` + "source-data ".repeat(i % 2 ? 9000 : 2000) }));
  const before = JSON.stringify(messages); const result = await manager.project(messages, []);
  expect(estimateMessageTokens(result) + 16384).toBeLessThan(65536);
  expect(model.prompts.length).toBeGreaterThan(0);
  for (const prompt of model.prompts) expect(estimateMessageTokens(prompt) + 16384).toBeLessThan(65536);
  expect(model.prompts.some(prompt => String(prompt[0]?.content).includes("source-marker-0"))).toBe(true);
  expect(JSON.stringify(messages)).toBe(before); assertPairs(result);
});
it("summarizes an oversized historical message in bounded fragments without dropping it", async () => {
  const { manager, model } = setup(); const messages = [new HumanMessage("x".repeat(100000))];
  const projected = await manager.project(messages, []);
  expect(estimateMessageTokens(projected) + 512).toBeLessThan(6000);
  expect(model.prompts.length).toBeGreaterThan(1); expect(String(messages[0]?.content)).toHaveLength(100000);
  for (const prompt of model.prompts) expect(estimateMessageTokens(prompt) + 512).toBeLessThan(6000);
});
it("keeps a parallel three-tool batch together at summary boundaries", async () => {
  const { manager, model } = setup(); const ids = ["parallel-a", "parallel-b", "parallel-c"];
  const messages = [...history(5), new AIMessage({ content: "", tool_calls: ids.map(id => ({ name: "read_file", args: { file_path: id }, id, type: "tool_call" as const })) }),
    ...ids.map(id => new ToolMessage({ content: `${id}-result ` + "source ".repeat(200), tool_call_id: id })), ...history(15, 10)];
  const result = await manager.project(messages, []);
  for (const prompt of model.prompts) {
    const text = String(prompt[0]?.content); const included = ids.filter(id => text.includes(`${id}-result`));
    expect([0, 3]).toContain(included.length);
  }
  const kept = result.filter(m => ToolMessage.isInstance(m) && ids.includes(m.tool_call_id));
  expect([0, 3]).toContain(kept.length); assertPairs(result);
});
it("absorbs a giant read instead of repeatedly summarizing only the cached summary", async () => {
  const model = new SummaryModel(), logs: any[] = [];
  const manager = new CreatorContextWindow({ environment: { CREATOR_MODEL_MAX_TOKENS: "16384" }, request: "extend the Composer Slot without vendor changes", signal: () => new AbortController().signal, model: () => model, log: async (event, data) => { logs.push({ event, ...data }); } });
  const messages = [new HumanMessage("Earlier project facts ".repeat(2500)),
    new AIMessage({ content: "", tool_calls: [{ name: "inspect_ui_edit_context", args: {}, id: "giant-read", type: "tool_call" }] }),
    new ToolMessage({ tool_call_id: "giant-read", content: "SOURCE_BEGIN\n" + "界面 source facts\n".repeat(12000) + "SOURCE_END" })];
  const before = JSON.stringify(messages); const result = await manager.project(messages, []);
  expect(estimateMessageTokens(result) + 16384).toBeLessThan(65536);
  expect(JSON.stringify(messages)).toBe(before);
  expect(model.prompts.some(p => String(p[0]?.content).includes("SOURCE_BEGIN"))).toBe(true);
  expect(model.prompts.some(p => String(p[0]?.content).includes("SOURCE_END"))).toBe(true);
  expect(logs.some(x => x.event === "context_summary_chunk")).toBe(true);
});
it("never adopts a partially summarized oversized tool batch after a failed fragment", async () => {
  let calls = 0; const model = new SummaryModel(() => { if (++calls === 2) throw new Error("second fragment failed"); return new AIMessage("Working summary; preserve vendor and verify the current task."); });
  const logs: any[] = []; const manager = new CreatorContextWindow({ environment: { CREATOR_MODEL_MAX_TOKENS: "16384" }, request: "keep vendor unchanged", signal: () => new AbortController().signal, model: () => model, log: async (event, data) => { logs.push({ event, ...data }); } });
  const messages = [new AIMessage({ content: "", tool_calls: [{ name: "read_file", args: {}, id: "read", type: "tool_call" }] }), new ToolMessage({ tool_call_id: "read", content: "SOURCE_BEGIN" + "x".repeat(220000) + "SOURCE_END" })]; const before = JSON.stringify(messages);
  await expect(manager.project(messages, [])).rejects.toThrow("CREATOR_CONTEXT_COMPACTION_FAILED"); expect(manager.stats.compactions).toBe(0);
  await manager.project(messages, []); expect(manager.stats.compactions).toBe(1);
  expect(logs.filter(x => x.event === "context_summary_chunk" && x.offset === 0)).toHaveLength(2);
  expect(JSON.stringify(messages)).toBe(before);
});
it("preserves literal JavaScript replacement sequences and template markers in source", async () => {
  const { manager, model } = setup(); const literal = "const source = '$& $$ $` $\' {messages}';";
  await manager.project([new HumanMessage(literal + "x".repeat(10000)), ...history(10)], []);
  expect(model.prompts.some(p => String(p[0]?.content).includes(literal))).toBe(true);
});
it("accepts a validated summary that quotes a historical error instead of mistaking it for native failure", async () => {
  const { manager } = setup(() => new AIMessage("Historical blocker: Error generating summary: unavailable provider. This is quoted task evidence, not the current summary call failing."));
  await manager.project(history(), []); expect(manager.stats.compactions).toBeGreaterThan(0);
});
it("consumes a giant first result with a tiny preamble and a soft recent-message target", async () => {
  const model = new SummaryModel(); const manager = new CreatorContextWindow({ environment: { CREATOR_CONTEXT_MAX_TOKENS: "6000", CREATOR_CONTEXT_KEEP_TOKENS: "5000", CREATOR_MODEL_MAX_TOKENS: "512" }, request: "inspect only", signal: () => new AbortController().signal, model: () => model, log: async () => {} });
  const messages = [new HumanMessage("inspect only"), new AIMessage({ content: "", tool_calls: [{ name: "read_file", args: {}, id: "large", type: "tool_call" }] }), new ToolMessage({ tool_call_id: "large", content: "begin\n" + "字🌟x ".repeat(20000) + "\nend" })];
  const result = await manager.project(messages, []); expect(estimateMessageTokens(result) + 512).toBeLessThan(6000);
  for (const prompt of model.prompts) expect(String(prompt[0]?.content)).not.toContain("\uFFFD");
  expect(model.prompts.some(p => String(p[0]?.content).includes("begin"))).toBe(true); expect(model.prompts.some(p => String(p[0]?.content).includes("end"))).toBe(true);
});
it("counts system/schema/output reservations, skips short requests and supports an explicit comparison switch", async () => {
  const { manager, model } = setup(); await manager.project([new HumanMessage("short")], []); expect(model.prompts).toHaveLength(0);
  await expect(manager.project(history(), [{ type: "function", function: { name: "large", description: "schema".repeat(4000), parameters: { type: "object", properties: {} } } }])).rejects.toThrow("CREATOR_CONTEXT_FIXED_BUDGET_EXCEEDED");
  const disabled = new CreatorContextWindow({ environment: { CREATOR_CONTEXT_COMPRESSION: "0" }, request: "do not edit", signal: () => new AbortController().signal, model: () => model, log: async () => {} });
  const original = history(); expect(await disabled.project(original, [])).toEqual(original); expect(model.prompts).toHaveLength(0);
});

it("budgets provider reasoning, counts native blocks once, and retains recent continuation data", async () => {
  const value = "synthetic reasoning ".repeat(120);
  const plain = new AIMessage("visible");
  const provider = new AIMessage({ content: "visible", additional_kwargs: { reasoning_content: value } });
  expect(estimateMessageTokens([provider])).toBeGreaterThan(estimateMessageTokens([plain]) + 500);
  const native = new AIMessage({ content: [{ type: "reasoning", reasoning: value }, { type: "text", text: "visible" }], response_metadata: { output_version: "v1" } });
  const aliased = new AIMessage({ content: native.content, additional_kwargs: { reasoning_content: value }, response_metadata: native.response_metadata });
  expect(estimateMessageTokens([aliased])).toBe(estimateMessageTokens([native]));
  const { manager } = setup();
  const recent = new AIMessage({ content: "", additional_kwargs: { reasoning_content: "recent-synthetic" }, tool_calls: [{ name: "read_file", args: {}, id: "recent", type: "tool_call" }] });
  const messages = [...history(), recent, new ToolMessage({ content: "recent result", tool_call_id: "recent" })];
  const before = JSON.stringify(messages);
  const projected = await manager.project(messages, []);
  expect(manager.stats.compactions).toBeGreaterThan(0);
  expect(projected.find(message => AIMessage.isInstance(message) && message.tool_calls?.some(call => call.id === "recent"))?.additional_kwargs.reasoning_content).toBe("recent-synthetic");
  expect(JSON.stringify(messages)).toBe(before);
});
