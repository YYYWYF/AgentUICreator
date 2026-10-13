import { describe, expect, it } from "vitest";
import type { RunAgentInput } from "@ag-ui/core";
import { askUserQuestionScenario } from "../src/builtins/index.js";
import { runMockScenario } from "../src/scenario-runner.js";

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
describe("question lifecycle interrupt", () => {
  it("pauses without a tool result and associates the gate with the call", async () => {
    expect(askUserQuestionScenario.resources).toEqual(["ask-user-question-demo"]);
    const stream = await events();
    expect(stream.filter(event => event.type === "TOOL_CALL_START")).toMatchObject([
      { toolCallName: "ask_user_question", toolCallId: "question-layout-call" },
    ]);
    expect(stream.some(event => event.type === "TOOL_CALL_RESULT")).toBe(false);
    expect(stream.at(-1)).toMatchObject({ type: "RUN_FINISHED", outcome: { type: "interrupt", interrupts: [
      { id: "question-layout", reason: "input_required", toolCallId: "question-layout-call" },
    ] } });
  });
  it("resumes from answers without a new user message or client tool result", async () => {
    const stream = await events({ ...input, runId: "resume-run", resume: [{
      interruptId: "question-layout", status: "resolved", payload: { answers: { layout: ["dashboard"] } },
    }] });
    expect(stream.some(event => event.type === "TOOL_CALL_START")).toBe(false);
    expect(stream).toContainEqual(expect.objectContaining({ type: "TOOL_CALL_RESULT", toolCallId: "question-layout-call" }));
    expect(stream.filter(event => event.type === "TEXT_MESSAGE_CONTENT").map(event => event.delta).join(""))
      .toBe("好的，我会按 Dashboard 布局继续设计。");
    expect(stream.at(-1)).toMatchObject({ type: "RUN_FINISHED", outcome: { type: "success" } });
  });
  it("rejects unrelated resume ids", async () => {
    await expect(events({ ...input, resume: [{ interruptId: "other", status: "resolved" }] })).rejects.toThrow("pending interrupt");
  });
  it("handles cancellation without inventing a selected answer", async () => {
    const stream = await events({ ...input, resume: [{ interruptId: "question-layout", status: "cancelled" }] });
    expect(stream.filter(event => event.type === "TEXT_MESSAGE_CONTENT").map(event => event.delta).join(""))
      .toBe(askUserQuestionScenario.humanQuestionContinuation!.errorText);
  });
});
