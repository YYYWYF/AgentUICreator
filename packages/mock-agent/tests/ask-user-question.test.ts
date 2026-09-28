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

describe("optional Human Tool scenario", () => {
  it("emits a pending Tool Call without a backend result", async () => {
    expect(askUserQuestionScenario.resources).toEqual(["ask-user-question-demo"]);
    const stream = await events();
    expect(stream.filter(event => event.type === "TOOL_CALL_START")).toMatchObject([
      { toolCallName: "ask_user_question" },
    ]);
    expect(stream.some(event => event.type === "TOOL_CALL_RESULT")).toBe(false);
    expect(stream.at(-1)?.type).toBe("RUN_FINISHED");
  });

  it("continues from the Human Tool result without a new user message", async () => {
    const messages: RunAgentInput["messages"] = [...input.messages,
      { id: "assistant-1", role: "assistant", toolCalls: [{ id: "question-call", type: "function",
        function: { name: "ask_user_question", arguments: "{}" } }] },
      { id: "result-1", role: "tool", toolCallId: "question-call",
        content: JSON.stringify({ answers: { layout: ["dashboard"] } }) },
    ];
    const stream = await events({ ...input, runId: "continuation-run", messages });
    expect(stream.some(event => event.type === "TOOL_CALL_START")).toBe(false);
    expect(stream.filter(event => event.type === "TEXT_MESSAGE_CONTENT").map(event => event.delta).join(""))
      .toBe("好的，我会按 Dashboard 布局继续设计。");
  });
});
