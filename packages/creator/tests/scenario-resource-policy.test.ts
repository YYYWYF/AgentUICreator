import { showcaseMockScenarios, type MockScenario } from "@agent-ui/mock-agent";
import { describe, expect, it } from "vitest";
import { collectScenarioResourceRequirements, installableScenarioSourceItemIds, mockDemoRequirements, scenarioSourceResources } from "../src/mock/demo-compatibility.js";

const resource = { id: "a2ui", label: "A2UI Official Integration", sourceItemId: "integration/a2ui" };
function scenario(id: string, resources = [resource]): MockScenario { return { id, title: id, steps: [], resources }; }

describe("Scenario resources are the Creator source requirement authority", () => {
  it("derives the pluginless A2UI requirement from its Scenario", () => {
    const requirement = mockDemoRequirements.find(item => item.id === "a2ui");
    expect(requirement).toEqual({ id: "a2ui", name: "A2UI Official Integration", sourceItemId: "integration/a2ui", scenarioIds: ["a2ui-interactive-order"] });
    expect(requirement!.plugin).toBeUndefined();
    expect(installableScenarioSourceItemIds.has("integration/a2ui")).toBe(true);
  });
  it("merges shared resources and deduplicates Scenario membership deterministically", () => {
    expect(collectScenarioResourceRequirements([scenario("order", [resource, resource]), scenario("form"), scenario("dashboard")])).toEqual([
      { id: "a2ui", name: resource.label, sourceItemId: resource.sourceItemId, scenarioIds: ["order", "form", "dashboard"] },
    ]);
    expect(collectScenarioResourceRequirements([{ id: "plain", title: "Plain", steps: [] }])).toEqual([]);
  });
  it.each([
    { ...resource, sourceItemId: "integration/other-a2ui" },
    { ...resource, label: "Different label" },
    { ...resource, id: "other-a2ui" },
  ])("rejects conflicting resource metadata during policy construction", conflicting => {
    expect(() => collectScenarioResourceRequirements([scenario("first"), scenario("second", [conflicting])])).toThrow(/conflict/i);
  });
  it("maintains exact bidirectional coverage between Scenario declarations and source requirements", () => {
    const sourceRequirements = mockDemoRequirements.filter(item => item.sourceItemId);
    expect(sourceRequirements).toEqual(scenarioSourceResources);
    for (const scenario of showcaseMockScenarios) for (const resource of scenario.resources ?? []) {
      const matching = sourceRequirements.filter(item => item.id === resource.id && item.sourceItemId === resource.sourceItemId);
      expect(matching).toHaveLength(1);
      expect(matching[0]!.name).toBe(resource.label);
      expect(matching[0]!.scenarioIds).toContain(scenario.id);
    }
    for (const requirement of sourceRequirements) {
      const declaringIds = showcaseMockScenarios.filter(scenario => scenario.resources?.some(resource => resource.id === requirement.id && resource.sourceItemId === requirement.sourceItemId)).map(scenario => scenario.id);
      expect(requirement.scenarioIds).toEqual(declaringIds);
      expect(requirement.plugin).toBeUndefined();
    }
    expect([...installableScenarioSourceItemIds]).toEqual([...new Set(sourceRequirements.map(item => item.sourceItemId))]);
    expect(mockDemoRequirements.filter(item => !item.sourceItemId).map(item => item.plugin?.id)).toEqual([
      "assistant-ui-reasoning", "assistant-ui-tool-group", "assistant-ui-tool-fallback", "chart-message", "job-progress-message", "agent-plan-message", "agent-status-message", "task-group",
    ]);
    expect(installableScenarioSourceItemIds.has("plugin/chart-message")).toBe(false);
  });
});
