import { describe, expect, it } from "vitest";
import type { RunAgentInput } from "@ag-ui/core";
import { askUserQuestionScenario } from "../../src/mock-agent/builtins/index.js";
import { runMockScenario } from "../../src/mock-agent/scenario-runner.js";
const input: RunAgentInput = {
  threadId: "question-thread", runId: "question-run", state: {}, context: [], forwardedProps: {},
  messages: [{ id: "user-1", role: "user", content: "帮我生成一个首页" }],
  tools: [{ name: "ask_user_question", description: "Ask a question", parameters: { type: "object" } }],
};
async function events(run: RunAgentInput = input) {
  const result = [];
  for await (const event of runMockScenario(run, askUserQuestionScenario, { timingScale: 0 })) result.push(event);
  return result;
}
async function continuation(content: string, error?: string, toolCallId?: string): Promise<RunAgentInput> {
  const stream = await events();
  const start = stream.find(event => event.type === "TOOL_CALL_START")!;
  return { ...input, runId: "continuation", messages: [...input.messages,
    { id: "assistant", role: "assistant", toolCalls: [{ id: start.toolCallId, type: "function", function: { name: "ask_user_question", arguments: "{}" } }] },
    { id: "answer", role: "tool", toolCallId: toolCallId ?? start.toolCallId, content, ...(error ? { error } : {}) },
  ] };
}
describe("question frontend tool lifecycle", () => {
  it("hands off the question with success, no interrupt and no backend result", async () => {
    const stream = await events();
    expect(stream.some(event => event.type === "TOOL_CALL_START" && event.toolCallName === "ask_user_question")).toBe(true);
    expect(stream.some(event => event.type === "TOOL_CALL_RESULT")).toBe(false);
    expect(stream.at(-1)).toMatchObject({ type: "RUN_FINISHED", outcome: { type: "success" } });
  });
  it("continues from the correlated ToolMessage without emitting a second tool result", async () => {
    const stream = await events(await continuation(JSON.stringify({ answers: { layout: ["dashboard"] } })));
    expect(stream.some(event => event.type === "TOOL_CALL_START" || event.type === "TOOL_CALL_RESULT")).toBe(false);
    expect(stream.filter(event => event.type === "TEXT_MESSAGE_CONTENT").map(event => event.delta).join(""))
      .toBe("好的，我会按 Dashboard 布局继续设计。");
    expect(stream.at(-1)).toMatchObject({ outcome: { type: "success" } });
  });
  it("keeps unanswered calls pending instead of repeating the question", async () => {
    const request = await continuation("{}", undefined, "other-call");
    const stream = await events(request);
    expect(stream.some(event => event.type === "TOOL_CALL_START" || event.type === "TEXT_MESSAGE_CONTENT")).toBe(false);
  });
  it.each(["{}", "not-json", JSON.stringify({ answers: { layout: ["unknown"] } })])("does not accept invalid answers: %s", async content => {
    const stream = await events(await continuation(content));
    expect(stream.filter(event => event.type === "TEXT_MESSAGE_CONTENT").map(event => event.delta).join(""))
      .toBe(askUserQuestionScenario.humanQuestionContinuation!.errorText);
  });
  it("handles an error ToolMessage without inventing an answer", async () => {
    const stream = await events(await continuation(JSON.stringify({ answers: { layout: ["dashboard"] } }), "Cancelled"));
    expect(stream.filter(event => event.type === "TEXT_MESSAGE_CONTENT").map(event => event.delta).join(""))
      .toBe(askUserQuestionScenario.humanQuestionContinuation!.errorText);
  });
  it("rejects the old resume channel", async () => {
    expect((await events({ ...input, resume: [{ interruptId: "question-layout", status: "resolved", payload: {} }] })).at(-1)?.type).toBe("RUN_ERROR");
  });
});
