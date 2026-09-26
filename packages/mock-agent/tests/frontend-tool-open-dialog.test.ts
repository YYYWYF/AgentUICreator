import { describe, expect, it } from "vitest";
import { EventType, type RunAgentInput } from "@ag-ui/core";
import { frontendToolOpenDialogScenario } from "../src/builtins/frontend-tool-open-dialog.js";
import { runMockScenario } from "../src/scenario-runner.js";
const input: RunAgentInput = { threadId: "t", runId: "r", state: {}, messages: [{ id: "u", role: "user", content: "open settings" }], tools: [{ name: "open_demo_dialog", description: "Open dialog", parameters: { type: "object" } }], context: [], forwardedProps: {} };
async function events(request: RunAgentInput) {
  const result = [];
  for await (const event of runMockScenario(request, frontendToolOpenDialogScenario, { timingScale: 0 })) result.push(event);
  return result;
}
describe("dialog frontend tool scenario", () => {
  it("defers the result to the client and recognizes only the current turn result", async () => {
    const first = await events(input);
    expect(first.map(event => event.type)).toEqual([EventType.RUN_STARTED, EventType.TOOL_CALL_START, EventType.TOOL_CALL_ARGS, EventType.TOOL_CALL_END, EventType.RUN_FINISHED]);
    const start = first.find(event => event.type === EventType.TOOL_CALL_START)!;
    if (start.type !== EventType.TOOL_CALL_START) throw new Error("Missing call");
    const continuation: RunAgentInput = { ...input, runId: "r2", messages: [...input.messages,
      { id: "a", role: "assistant", toolCalls: [{ id: start.toolCallId, type: "function", function: { name: "open_demo_dialog", arguments: '{"title":"Settings","message":"Preferences"}' } }] },
      { id: "result", role: "tool", toolCallId: start.toolCallId, content: '{"opened":true,"title":"Settings"}' },
    ] };
    const second = await events(continuation);
    expect(second.some(event => event.type === EventType.TOOL_CALL_START)).toBe(false);
    expect(second.filter(event => event.type === EventType.TEXT_MESSAGE_CONTENT).map(event => event.delta).join("")).toContain("已经打开设置弹窗");
    const fresh = await events({ ...continuation, runId: "r3", messages: [...continuation.messages, { id: "u2", role: "user", content: "open again" }] });
    expect(fresh.some(event => event.type === EventType.TOOL_CALL_START)).toBe(true);
  });
  it.each(['{"opened":true}', '{"selected":true}', "plain-text receipt", '{"opened":false}'])(
    "treats successful ToolMessage content as opaque: %s", async content => {
      const result = await events({ ...input, messages: [...input.messages,
        { id: "a", role: "assistant", toolCalls: [{ id: "call", type: "function", function: { name: "open_demo_dialog", arguments: "{}" } }] },
        { id: "result", role: "tool", toolCallId: "call", content },
      ] });
      expect(result.filter(event => event.type === EventType.TEXT_MESSAGE_CONTENT).map(event => event.delta).join("")).toContain("已经打开设置弹窗");
    },
  );
  it("uses the standard ToolMessage error marker", async () => {
    const result = await events({ ...input, messages: [...input.messages,
      { id: "a", role: "assistant", toolCalls: [{ id: "call", type: "function", function: { name: "open_demo_dialog", arguments: "{}" } }] },
      { id: "result", role: "tool", toolCallId: "call", content: '{"selected":true}', error: "Capability unavailable" },
    ] });
    expect(result.filter(event => event.type === EventType.TEXT_MESSAGE_CONTENT).map(event => event.delta).join("")).toContain("无法打开弹窗");
  });
  it("does not call an unavailable tool", async () => {
    const result = await events({ ...input, tools: [] });
    expect(result.some(event => event.type === EventType.TOOL_CALL_START)).toBe(false);
  });
});
