import type { RunAgentInput } from "@ag-ui/core";
import { describe, expect, it } from "vitest";
import { runMockScenario } from "../../src/mock-agent/scenario-runner.js";
import { askUserQuestionScenario } from "../../src/mock-agent/builtins/ask-user-question.js";
import { frontendToolFillFormScenario } from "../../src/mock-agent/builtins/frontend-tool-fill-form.js";

describe("multipart tool answer continuation", () => {
  it.each([
    { scenario: askUserQuestionScenario, name: "ask_user_question", answer: { answers: { layout: ["dashboard"] } }, expected: "好的，我会按数据总览布局继续设计。" },
    { scenario: frontendToolFillFormScenario, name: "collect_user_details", answer: { values: { firstName: "Bob", lastName: "Li", email: "bob@example.com", projectIdea: "Tasks" } }, expected: "已收到 Bob 的资料" },
  ].flatMap(test => [false, true].map(resultOnly => ({ ...test, resultOnly }))))("continues $name from text parts (resultOnly=$resultOnly)", async ({ scenario, name, answer, expected, resultOnly }) => {
    const text = JSON.stringify(answer), split = Math.floor(text.length / 2);
    const input: RunAgentInput = {
      threadId: "multipart", runId: "continuation", state: {}, context: [], tools: [], forwardedProps: {},
      messages: [
        { id: "u1", role: "user", content: "Collect input" },
        { id: "a1", role: "assistant", content: "", toolCalls: [{ id: "call1", type: "function", function: { name, arguments: "{}" } }] },
        { id: "t1", role: "tool", toolCallId: "call1", content: [
          { type: "text", text: text.slice(0, split) },
          { type: "image", source: { type: "url", value: "https://example.test/image.png" } },
          { type: "text", text: text.slice(split) },
        ] },
      ],
    };
    if (resultOnly) input.messages = input.messages.filter(message => message.role === "tool");
    const events = [];
    for await (const event of runMockScenario(input, scenario, { timingScale: 0 })) events.push(event);
    expect(events.filter(event => event.type === "TEXT_MESSAGE_CONTENT").map(event => event.delta).join("")).toContain(expected);
    expect(events.filter(event => event.type === "RUN_FINISHED")).toHaveLength(1);
    expect(events.some(event => event.type === "TOOL_CALL_START" || event.type === "RUN_ERROR")).toBe(false);
  });
});
