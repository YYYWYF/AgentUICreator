import { EventType, type AGUIEvent, type RunAgentInput } from "@ag-ui/core";
import { describe, expect, it } from "vitest";
import { runMockScenario } from "../src/scenario-runner.js";
import { a2uiInteractiveOrderScenario } from "../src/builtins/a2ui-interactive-order.js";
import { defineScenario, validateMockScenario, type MockScenario } from "../src/scenario.js";
const input: RunAgentInput = { threadId: "thread", runId: "run", messages: [{ id: "user", role: "user", content: "Order" }], tools: [], context: [], state: {}, forwardedProps: {} };
async function collect(scenario: MockScenario, request = input) {
  const events: AGUIEvent[] = [];
  for await (const event of runMockScenario(request, scenario, { timingScale: 0 })) events.push(event);
  return events;
}
describe("standard activity snapshots and generic A2UI action branches", () => {
  it("emits AG-UI snapshots, including explicitly supplied optional fields", async () => {
    const events = await collect(defineScenario({ id: "snapshot", title: "Snapshot", steps: [{ type: "activity-snapshot", activityType: "any-activity", messageId: "activity", content: { state: "ready" }, replace: false, subagentRunId: "child", delayMs: 0 }] }));
    expect(events[1]).toEqual({ type: EventType.ACTIVITY_SNAPSHOT, activityType: "any-activity", messageId: "activity", content: { state: "ready" }, replace: false, subagentRunId: "child" });
  });
  it("allocates missing message IDs without inventing a private wire event", async () => {
    const events = await collect(defineScenario({ id: "generated", title: "Generated", steps: [{ type: "activity-snapshot", activityType: "status", content: {} }] }));
    expect(events[1]).toMatchObject({ type: EventType.ACTIVITY_SNAPSHOT, messageId: expect.any(String) });
    expect(events[1]).not.toHaveProperty("replace");
  });
  it("offers a pluginless Integration resource and emits only the standard surface lifecycle", async () => {
    expect(a2uiInteractiveOrderScenario.resources).toEqual([{ id: "a2ui", label: "A2UI Official Integration", sourceItemId: "integration/a2ui" }]);
    const events = await collect(a2uiInteractiveOrderScenario);
    expect(events.map(event => event.type)).toEqual([EventType.RUN_STARTED, EventType.ACTIVITY_SNAPSHOT, EventType.RUN_FINISHED]);
    expect(events[1]).toMatchObject({ activityType: "a2ui-surface", replace: true, content: { a2ui_operations: expect.any(Array) } });
  });
  it.each(["confirm_order", "cancel_order"])("selects the %s branch from forwardedProps without resume or Tool results", async name => {
    const request = { ...input, runId: "action-run", forwardedProps: { a2uiAction: { userAction: { name } } } };
    const events = await collect(a2uiInteractiveOrderScenario, request);
    expect(events.some(event => event.type === EventType.TOOL_CALL_START || event.type === EventType.TOOL_CALL_RESULT || event.type === EventType.CUSTOM)).toBe(false);
    const text = events.flatMap(event => event.type === EventType.TEXT_MESSAGE_CONTENT ? [event.delta] : []).join("");
    expect(text).toBe(name === "confirm_order" ? "Order confirmed." : "Order cancelled.");
    expect(request.messages).toEqual(input.messages);
    expect(request).not.toHaveProperty("resume");
  });
  it("does not hard-code action names or reset shared state during an action continuation", async () => {
    const scenario = defineScenario({ id: "generic", title: "Generic", initialState: { initial: true }, steps: [], a2uiActions: { branches: { arbitrary_action: [{ type: "message", text: "Selected" }] }, fallback: [{ type: "message", text: "Fallback" }] } });
    for (const [name, expected] of [["arbitrary_action", "Selected"], ["missing", "Fallback"], ["__proto__", "Fallback"]]) {
      const events = await collect(scenario, { ...input, forwardedProps: { a2uiAction: { userAction: { name } } } });
      expect(events.some(event => event.type === EventType.STATE_SNAPSHOT)).toBe(false);
      expect(events.flatMap(event => event.type === EventType.TEXT_MESSAGE_CONTENT ? [event.delta] : []).join("")).toBe(expected);
    }
  });
  it("validates action branches as well as initial steps", () => {
    expect(() => validateMockScenario(defineScenario({ id: "invalid", title: "Invalid", steps: [], a2uiActions: { branches: { bad: [{ type: "activity-snapshot", activityType: " ", content: {} }] } } }))).toThrow("activityType");
  });
});
