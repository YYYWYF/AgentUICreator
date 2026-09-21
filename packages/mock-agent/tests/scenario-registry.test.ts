import { describe, expect, it } from "vitest";

import { builtinMockScenarios } from "../src/builtins/index.js";
import { createScenarioRegistry } from "../src/scenario-registry.js";
import { defineScenario } from "../src/scenario.js";

describe("createScenarioRegistry", () => {
  it("registers and lists every scenario as metadata only", () => {
    const registry = createScenarioRegistry({
      scenarios: builtinMockScenarios,
      defaultScenarioId: "reasoning-tool-success",
    });

    expect(registry.list()).toHaveLength(builtinMockScenarios.length);
    expect(registry.list()).toEqual(builtinMockScenarios.map(
      ({ id, title, description, category, capabilities, reference }) => ({
        id,
        title,
        ...(description === undefined ? {} : { description }),
        ...(category === undefined ? {} : { category }),
        ...(capabilities === undefined ? {} : { capabilities }),
        ...(reference === undefined ? {} : { reference }),
      }),
    ));
    expect(registry.list()[0]).not.toHaveProperty("steps");
    expect(registry.list()[0]).not.toHaveProperty("initialState");
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

  it("includes a long streaming reasoning preview scenario", () => {
    const scenario = builtinMockScenarios.find(
      ({ id }) => id === "reasoning-long-preview",
    );

    expect(scenario).toMatchObject({
      id: "reasoning-long-preview",
      steps: [expect.objectContaining({ type: "reasoning", durationMs: 10_000 })],
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
});
