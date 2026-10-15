import { describe, expect, it } from "vitest";
import type { RunAgentInput } from "@ag-ui/core";
import { frontendToolFillFormScenario } from "../../src/mock-agent/builtins/index.js";
import { runMockScenario } from "../../src/mock-agent/scenario-runner.js";
const input: RunAgentInput = { threadId: "t", runId: "r", state: {}, messages: [{ id: "u", role: "user", content: "collect details" }], tools: [{ name: "collect_user_details", description: "Collect details", parameters: { type: "object" } }], context: [], forwardedProps: {} };
const callId = "r:tool-call:2";
const pending: RunAgentInput = { ...input, messages: [...input.messages, { id: "assistant", role: "assistant", toolCalls: [
  { id: callId, type: "function", function: { name: "collect_user_details", arguments: "{}" } },
] }] };
const values = { firstName: "Bob", lastName: "Li", email: "bob@example.com", projectIdea: "任务管理" };
function submitted(value: unknown, error?: string): RunAgentInput {
  return { ...pending, runId: "continuation", messages: [...pending.messages, {
    id: "result", role: "tool", toolCallId: callId, content: JSON.stringify(value), ...(error ? { error } : {}),
  }] };
}
async function events(value = input) {
  const result = [];
  for await (const event of runMockScenario(value, frontendToolFillFormScenario, { timingScale: 0 })) result.push(event);
  return result;
}
describe("conversation information form", () => {
  it("hands off the blank form with success and no backend tool result", async () => {
    expect(frontendToolFillFormScenario.resources).toEqual(["human-form-demo"]);
    const stream = await events();
    expect(stream.filter(event => event.type === "TOOL_CALL_START")).toMatchObject([{ toolCallName: "collect_user_details" }]);
    expect(stream.filter(event => event.type === "TOOL_CALL_ARGS").map(event => event.delta).join("")).toBe("{}");
    expect(stream.some(event => event.type === "TOOL_CALL_RESULT")).toBe(false);
    expect(stream.at(-1)).toMatchObject({ type: "RUN_FINISHED", outcome: { type: "success" } });
  });
  it("assigns a fresh call identity to each user turn", async () => {
    const first = (await events()).find(event => event.type === "TOOL_CALL_START");
    const second = (await events({ ...input, runId: "retry-run" })).find(event => event.type === "TOOL_CALL_START");
    expect(first).toBeDefined(); expect(second).toBeDefined();
    expect(second!.toolCallId).not.toBe(first!.toolCallId);
  });
  it("continues from the submitted ToolMessage without another form or backend result", async () => {
    const stream = await events(submitted({ values }));
    expect(stream.some(event => event.type === "TOOL_CALL_START" || event.type === "TOOL_CALL_RESULT")).toBe(false);
    const answer = stream.filter(event => event.type === "TEXT_MESSAGE_CONTENT").map(event => event.delta).join("");
    expect(answer).toContain("Bob"); expect(answer).toContain("bob@example.com"); expect(answer).toContain("任务管理");
    expect(stream.at(-1)).toMatchObject({ type: "RUN_FINISHED", outcome: { type: "success" } });
  });
  it("does not repeat an unanswered form or consume an unrelated result", async () => {
    for (const request of [pending, { ...pending, messages: [...pending.messages,
      { id: "other", role: "tool" as const, toolCallId: "other-call", content: JSON.stringify({ values }) },
    ] }]) {
      const stream = await events(request);
      expect(stream.some(event => event.type === "TOOL_CALL_START" || event.type === "TEXT_MESSAGE_CONTENT")).toBe(false);
      expect(stream.at(-1)).toMatchObject({ outcome: { type: "success" } });
    }
  });
  it.each([{ ...values, firstName: " " }, { ...values, email: "bad" }, { firstName: "Bob" }, { ...values, extra: "unexpected" }])("rejects invalid submitted data", async value => {
    expect((await events(submitted({ values: value }))).at(-1)?.type).toBe("RUN_ERROR");
  });
  it("rejects the old interrupt answer channel", async () => {
    expect((await events({ ...pending, resume: [{ interruptId: "collect-details", status: "resolved", payload: { values } }] })).at(-1)?.type).toBe("RUN_ERROR");
  });
  it("accepts frontend cancellation as an error ToolMessage", async () => {
    const stream = await events(submitted({}, "Cancelled"));
    expect(stream.filter(event => event.type === "TEXT_MESSAGE_CONTENT").map(event => event.delta).join("")).toContain("资料收集已结束");
    expect(stream.some(event => event.type === "TOOL_CALL_START")).toBe(false);
  });
  it("does not reuse a previous turn's receipt", async () => {
    const previous = submitted({ values });
    const stream = await events({ ...previous, runId: "fresh", messages: [...previous.messages, { id: "u2", role: "user", content: "collect again" }] });
    expect(stream.some(event => event.type === "TOOL_CALL_START")).toBe(true);
  });
});
