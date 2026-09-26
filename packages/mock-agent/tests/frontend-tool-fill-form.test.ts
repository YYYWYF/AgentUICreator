import { describe, expect, it } from "vitest";
import type { RunAgentInput } from "@ag-ui/core";
import { frontendToolFillFormScenario, frontendToolOpenDialogScenario, showcaseMockScenarios } from "../src/builtins/index.js";
import { createScenarioRegistry } from "../src/scenario-registry.js";
import { runMockScenario } from "../src/scenario-runner.js";
const input: RunAgentInput = { threadId: "t", runId: "r", state: {}, messages: [{ id: "u", role: "user", content: "fill form" }], tools: [{ name: "set_form_field", description: "Set field", parameters: { type: "object" } }], context: [], forwardedProps: {} };
async function events(value = input) {
  const result = [];
  for await (const event of runMockScenario(value, frontendToolFillFormScenario, { timingScale: 0 })) result.push(event);
  return result;
}
describe("optional frontend form scenario", () => {
  it("always discovers both bundles without installed source", () => {
    const catalog = createScenarioRegistry({ scenarios: showcaseMockScenarios, defaultScenarioId: "frontend-tool-fill-form" }).list();
    for (const scenario of [frontendToolFillFormScenario, frontendToolOpenDialogScenario]) {
      expect(catalog.find(item => item.id === scenario.id)?.resources).toEqual(scenario.resources);
    }
  });
  it("emits two native frontend calls without backend results or submit", async () => {
    const stream = await events();
    expect(stream.filter(event => event.type === "TOOL_CALL_START")).toHaveLength(2);
    expect(stream.filter(event => event.type === "TOOL_CALL_START").map(event => event.toolCallName)).toEqual(["set_form_field", "set_form_field"]);
    expect(stream.some(event => event.type === "TOOL_CALL_RESULT")).toBe(false);
    expect(stream.at(-1)?.type).toBe("RUN_FINISHED");
  });
  it("acknowledges the entire batch and rejects a failed receipt", async () => {
    const messages: RunAgentInput["messages"] = [...input.messages,
      { id: "a", role: "assistant", toolCalls: ["name", "email"].map(id => ({ id, type: "function" as const, function: { name: "set_form_field", arguments: "{}" } })) },
      { id: "result-name", role: "tool", toolCallId: "name", content: '{"success":true}' },
      { id: "result-email", role: "tool", toolCallId: "email", content: '{"success":true}' },
    ];
    const stream = await events({ ...input, messages });
    expect(stream.filter(event => event.type === "TEXT_MESSAGE_CONTENT").map(event => event.delta).join("")).toBe(frontendToolFillFormScenario.frontendContinuation!.successText);
    const failed = await events({ ...input, messages: [...messages.slice(0, -1), { id: "failed", role: "tool", toolCallId: "email", content: '{"success":false}' }] });
    expect(failed.filter(event => event.type === "TEXT_MESSAGE_CONTENT").map(event => event.delta).join("")).toBe(frontendToolFillFormScenario.frontendContinuation!.errorText);
    expect((await events({ ...input, messages: messages.slice(0, -1) })).some(event => event.type === "TOOL_CALL_START")).toBe(false);
  });
});
