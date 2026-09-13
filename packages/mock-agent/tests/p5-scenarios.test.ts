import {
  EventSchemas,
  EventType,
  type RunAgentInput,
} from "@ag-ui/core";
import { describe, expect, it } from "vitest";

import {
  approvalResumeScenario,
  builtinMockScenarios,
  parallelToolsScenario,
  subagentLifecycleScenario,
} from "../src/builtins/index.js";
import { runMockScenario } from "../src/scenario-runner.js";
import { defineScenario, type MockScenario } from "../src/scenario.js";

const input: RunAgentInput = {
  threadId: "p5-thread",
  runId: "p5-run",
  state: {},
  messages: [],
  tools: [],
  context: [],
  forwardedProps: {},
};

async function collect(
  scenario: MockScenario,
  runInput = input,
) {
  const events = [] as Awaited<ReturnType<typeof EventSchemas.parse>>[];
  for await (const event of runMockScenario(runInput, scenario, {
    timingScale: 0,
  })) {
    events.push(EventSchemas.parse(event));
  }
  return events;
}

describe("P5-A mock scenarios", () => {
  it("uses deterministic run-scoped ids", async () => {
    const scenario = defineScenario({
      id: "deterministic-ids",
      title: "Deterministic IDs",
      steps: [{
        type: "tool",
        name: "search_files",
        args: { query: "agent" },
        result: { matches: [] },
        prepareDurationMs: 0,
        durationMs: 0,
      }],
    });
    const first = await collect(scenario);
    const second = await collect(scenario);
    expect(first).toEqual(second);
    expect(first).toContainEqual(expect.objectContaining({
      type: EventType.TOOL_CALL_START,
      toolCallId: "p5-run:tool-call:1",
    }));
  });

  it("schedules parallel tools with stable interleaving", async () => {
    const events = await collect(parallelToolsScenario);
    const lifecycle = events.filter((event) =>
      event.type === EventType.TOOL_CALL_START ||
      event.type === EventType.TOOL_CALL_ARGS ||
      event.type === EventType.TOOL_CALL_END ||
      event.type === EventType.TOOL_CALL_RESULT
    );
    expect(lifecycle.slice(0, 6)).toEqual([
      expect.objectContaining({ type: EventType.TOOL_CALL_START, toolCallId: "parallel-search-files" }),
      expect.objectContaining({ type: EventType.TOOL_CALL_ARGS, toolCallId: "parallel-search-files" }),
      expect.objectContaining({ type: EventType.TOOL_CALL_START, toolCallId: "parallel-inspect-component" }),
      expect.objectContaining({ type: EventType.TOOL_CALL_ARGS, toolCallId: "parallel-inspect-component" }),
      expect.objectContaining({ type: EventType.TOOL_CALL_START, toolCallId: "parallel-read-config" }),
      expect.objectContaining({ type: EventType.TOOL_CALL_ARGS, toolCallId: "parallel-read-config" }),
    ]);
    expect(lifecycle.map((event) => event.type)).toContain(
      EventType.TOOL_CALL_RESULT,
    );
  });

  it("compiles every builtin through the pinned AG-UI schemas", async () => {
    for (const scenario of builtinMockScenarios) {
      const events = await collect(scenario);
      expect(events[0]).toMatchObject({ type: EventType.RUN_STARTED });
      expect(events.some(({ type }) => type === EventType.RUN_FINISHED || type === EventType.RUN_ERROR))
        .toBe(true);
    }
  });

  it("uses resume steps for structured approval interrupts", async () => {
    const first = await collect(approvalResumeScenario);
    const interrupt = first.find((event) =>
      event.type === EventType.RUN_FINISHED && event.outcome?.type === "interrupt"
    );
    expect(interrupt).toMatchObject({
      type: EventType.RUN_FINISHED,
      outcome: { type: "interrupt" },
    });
    if (interrupt?.type !== EventType.RUN_FINISHED ||
      interrupt.outcome?.type !== "interrupt") return;

    const resumed = await collect(approvalResumeScenario, {
      ...input,
      runId: "p5-resume",
      resume: interrupt.outcome.interrupts.map(({ id }) => ({
        interruptId: id,
        status: "resolved" as const,
        payload: { approved: true },
      })),
    });
    expect(resumed).toContainEqual(expect.objectContaining({
      type: EventType.TEXT_MESSAGE_START,
    }));
    expect(resumed.at(-1)).toMatchObject({
      type: EventType.RUN_FINISHED,
      outcome: { type: "success" },
    });
  });

  it("keeps standard subagent lifecycle separate from dispatch presentation", async () => {
    const events = await collect(subagentLifecycleScenario);
    expect(events).toContainEqual(expect.objectContaining({
      type: EventType.SUBAGENT_STARTED,
      subagentRunId: "lifecycle-completed",
    }));
    expect(events).toContainEqual(expect.objectContaining({
      type: EventType.SUBAGENT_FINISHED,
      subagentRunId: "lifecycle-completed",
      outcome: { type: "success" },
    }));
    expect(events).toContainEqual(expect.objectContaining({
      type: EventType.SUBAGENT_STARTED,
      subagentRunId: "lifecycle-error",
    }));
    expect(events).toContainEqual(expect.objectContaining({
      type: EventType.SUBAGENT_ERROR,
      subagentRunId: "lifecycle-error",
      message: "Worker failed",
      code: "WORKER_FAILED",
    }));
  });
});
