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

    expect(registry.list()).toHaveLength(4);
    expect(registry.list()).toEqual(builtinMockScenarios.map(
      ({ id, title, description }) => ({ id, title, description }),
    ));
    expect(registry.list()[0]).not.toHaveProperty("steps");
    expect(registry.list()[0]).not.toHaveProperty("initialState");
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
