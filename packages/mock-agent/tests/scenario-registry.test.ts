import { describe, expect, it } from "vitest";

import {
  backendReferenceMockScenarios,
  builtinMockScenarios,
  frontendPresentationMockScenarios,
  mockRegressionScenarios,
  showcaseMockScenarios,
} from "../src/builtins/index.js";
import { createScenarioRegistry } from "../src/scenario-registry.js";
import { defineScenario, type MockScenario } from "../src/scenario.js";

describe("createScenarioRegistry", () => {
  it("keeps the showcase catalog separate from regression fixtures", () => {
    expect(backendReferenceMockScenarios.map(({ id }) => id)).toEqual([
      "multimodal-input",
      "concurrent-conversations",
      "simple-chat",
      "markdown-showcase",
      "reasoning-chat",
      "reasoning-tool-success",
      "parallel-tools",
      "tool-error",
      "approval-resume",
      "agent-state-sync",
      "nested-subagent-conversation",
    ]);
    expect(backendReferenceMockScenarios).toHaveLength(11);
    expect(backendReferenceMockScenarios.every(({ reference }) =>
      reference?.audience === "backend",
    )).toBe(true);
    expect(frontendPresentationMockScenarios.every(({ reference }) =>
      reference?.audience === "frontend",
    )).toBe(true);
    expect(showcaseMockScenarios.map(({ id }) => id)).toEqual([
      "multimodal-input",
      "concurrent-conversations",
      "simple-chat",
      "markdown-showcase",
      "reasoning-chat",
      "reasoning-tool-success",
      "parallel-tools",
      "tool-error",
      "approval-resume",
      "agent-state-sync",
      "nested-subagent-conversation",
      "resumable-long-run",
      "cancel-before-first-output",
      "file-output",
      "a2ui-form-controls",
      "a2ui-interactive-order",
      "frontend-tool-open-dialog",
      "frontend-tool-fill-form",
      "ask-user-question",
      "multi-message-response",
      "data-message-chart",
      "nested-subagent-task-group",
      "agent-plan",
      "agent-status",
      "nested-subagent-recursive",
      "nested-subagent-error",
    ]);
    expect(mockRegressionScenarios.map(({ id }) => id)).toEqual([
      "reasoning-long-preview",
      "multi-tool",
      "tool-long-running",
      "subagent-lifecycle",
    ]);
    expect(mockRegressionScenarios.every(({ reference }) =>
      reference?.audience === "internal",
    )).toBe(true);
    expect(showcaseMockScenarios).not.toEqual(
      expect.arrayContaining(mockRegressionScenarios),
    );
    expect(builtinMockScenarios.map(({ id }) => id)).toEqual([
      ...showcaseMockScenarios.map(({ id }) => id),
      ...mockRegressionScenarios.map(({ id }) => id),
    ]);
    expect(builtinMockScenarios.map(({ id }) => id)).not.toEqual(
      expect.arrayContaining([
        "step-lifecycle",
        "subagents",
        "subagents-out-of-order",
        "agent-elements-showcase",
      ]),
    );
  });

  it("registers and lists every scenario as metadata only", () => {
    const registry = createScenarioRegistry({
      scenarios: builtinMockScenarios,
      defaultScenarioId: "reasoning-tool-success",
    });

    expect(registry.list()).toHaveLength(builtinMockScenarios.length);
    expect(registry.list()).toEqual(builtinMockScenarios.map(
      ({ id, title, description, category, capabilities, reference, resources }) => ({
        id,
        title,
        ...(resources === undefined ? {} : { resources: [...resources] }),
        ...(description === undefined ? {} : { description }),
        ...(category === undefined ? {} : { category }),
        ...(capabilities === undefined ? {} : { capabilities }),
        ...(reference === undefined ? {} : { reference }),
      }),
    ));
    for (const summary of registry.list()) {
      expect(summary).not.toHaveProperty("steps");
      expect(summary).not.toHaveProperty("initialState");
      for (const resourceId of summary.resources ?? []) {
        expect(resourceId).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
        expect(resourceId).not.toMatch(/assistant-ui|sourceItemId|packages/);
      }
      expect(JSON.stringify(summary.resources ?? [])).not.toMatch(/sourceItemId|package|@assistant-ui/);
    }
  });

  it("exposes reference documentation without exposing scenario execution data", () => {
    const registry = createScenarioRegistry({
      scenarios: builtinMockScenarios,
      defaultScenarioId: "reasoning-tool-success",
    });
    const canonical = registry.list().find(
      ({ id }) => id === "nested-subagent-conversation",
    );

    expect(canonical?.reference).toMatchObject({
      protocol: "AG-UI",
      pattern: "Agents as Tools / Nested Subagent",
      presentation: "assistant-ui TaskCard",
      level: "recommended",
    });
    expect(canonical?.reference?.eventFlow?.some((step) =>
      step.includes("subagentRunId"),
    )).toBe(true);
    expect(canonical).not.toHaveProperty("steps");
  });

  it("documents authoritative plan Activity projection and separate AgentStatus presentation", () => {
    const registry = createScenarioRegistry({
      scenarios: builtinMockScenarios,
      defaultScenarioId: "reasoning-tool-success",
    });

    expect(registry.list().find(({ id }) => id === "agent-plan")?.reference?.eventFlow).toEqual([
      "RUN_STARTED",
      "ACTIVITY_SNAPSHOT (agent-plan)",
      "ACTIVITY_DELTA (activeIndex)",
      "ACTIVITY_DELTA (activeIndex)",
      "ACTIVITY_DELTA (activeIndex)",
      "ACTIVITY_DELTA (all done)",
      "TEXT_MESSAGE_*",
      "RUN_FINISHED",
    ]);
    expect(registry.list().find(({ id }) => id === "agent-plan")?.title)
      .toBe("AG-UI Activity → AgentPlan");
    expect(registry.list().find(({ id }) => id === "agent-status")?.reference?.eventFlow).toEqual([
      "TOOL_CALL_START",
      "TOOL_CALL_ARGS",
      "application projector → AgentStatus",
      "TOOL_CALL_END",
      "TOOL_CALL_RESULT (acknowledgement)",
    ]);
  });

  it("includes a long streaming reasoning preview scenario", () => {
    const scenario = builtinMockScenarios.find(
      ({ id }) => id === "reasoning-long-preview",
    );

    expect(scenario).toMatchObject({
      id: "reasoning-long-preview",
      steps: [
        expect.objectContaining({ type: "reasoning", durationMs: 10_000 }),
        expect.objectContaining({ type: "message" }),
      ],
    });
    expect(scenario?.steps[0]?.type === "reasoning"
      ? scenario.steps[0].text.length
      : 0).toBeGreaterThan(300);
  });

  it("returns the configured default scenario", () => {
    const registry = createScenarioRegistry({
      scenarios: builtinMockScenarios,
      defaultScenarioId: "reasoning-tool-success",
    });

    expect(registry.getDefault().id).toBe("reasoning-tool-success");
  });

  it("rejects duplicate scenario ids", () => {
    const duplicate = defineScenario({
      id: "duplicate",
      title: "Duplicate",
      steps: [],
    });

    expect(() => createScenarioRegistry({
      scenarios: [duplicate, { ...duplicate, title: "Duplicate Again" }],
      defaultScenarioId: "duplicate",
    })).toThrow("Duplicate mock scenario id: duplicate");
  });

  it("rejects an unknown default scenario", () => {
    expect(() => createScenarioRegistry({
      scenarios: builtinMockScenarios,
      defaultScenarioId: "missing",
    })).toThrow("Unknown default mock scenario: missing");
  });

  it("rejects an empty registry", () => {
    expect(() => createScenarioRegistry({
      scenarios: [],
      defaultScenarioId: "missing",
    })).toThrow("Mock scenario registry requires at least one scenario.");
  });

  it("rejects interrupts nested inside a subagent", () => {
    const invalid = defineScenario({
      id: "nested-interrupt",
      title: "Nested Interrupt",
      steps: [{
        type: "subagent",
        id: "researcher-1",
        name: "Researcher",
        steps: [{
          type: "interrupt",
          toolCallId: "approval-1",
          toolName: "approve_change",
          args: {},
          interrupt: { id: "interrupt-1", reason: "tool_call" },
        }],
        outcome: { type: "completed" },
      }],
    });

    expect(() => createScenarioRegistry({
      scenarios: [invalid],
      defaultScenarioId: invalid.id,
    })).toThrow(
      "Nested subagent interrupts are not supported by the current AG-UI 0.0.59 + assistant-ui reference profile.",
    );
  });

  it("rejects run-scoped Tool errors inside a subagent", () => {
    const invalid = defineScenario({
      id: "subagent-tool-error",
      title: "Subagent Tool Error",
      steps: [{
        type: "subagent",
        id: "researcher-1",
        name: "Researcher",
        steps: [{
          type: "tool",
          name: "read_file",
          args: {},
          result: null,
          error: { type: "error", message: "failed" },
        }],
        outcome: { type: "completed" },
      }],
    });

    expect(() => createScenarioRegistry({
      scenarios: [invalid],
      defaultScenarioId: invalid.id,
    })).toThrow("contains a Tool error inside subagent");
  });

  it("rejects non-object canonical Tool args", () => {
    const invalid = {
      id: "invalid-tool-args",
      title: "Invalid Tool Args",
      steps: [{
        type: "tool",
        name: "bad_tool",
        args: ["not-an-object"],
        result: {},
      }],
    } as unknown as MockScenario;

    expect(() => createScenarioRegistry({
      scenarios: [invalid],
      defaultScenarioId: invalid.id,
    })).toThrow("args must be a JSON object");
  });
});


it("serializes Scenario resources as stable IDs and rejects implementation objects", () => {
  const registry = createScenarioRegistry({ scenarios: [{ id: "resource-demo", title: "Demo", steps: [], resources: ["a2ui"] }], defaultScenarioId: "resource-demo" });
  expect(registry.list()[0]!.resources).toEqual(["a2ui"]);
  expect(JSON.stringify(registry.list())).not.toContain("sourceItemId");
  const malformed = { id: "a2ui", sourceItemId: "integration/a2ui" } as unknown as string;
  expect(() => createScenarioRegistry({ scenarios: [{ id: "resource-demo", title: "Demo", steps: [], resources: [malformed] }], defaultScenarioId: "resource-demo" })).toThrow(/Invalid official resource/);
});
