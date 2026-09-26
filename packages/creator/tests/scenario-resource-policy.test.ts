import { showcaseMockScenarios, type MockScenario, type MockScenarioResourceRequirement } from "@agent-ui/mock-agent";
import { describe, expect, it } from "vitest";
import { collectScenarioResourceRequirements, installableScenarioSourceItemIds, mockDemoRequirements, scenarioSourceResources } from "../src/mock/demo-compatibility.js";

const resource = { id: "a2ui", label: "A2UI Official Integration", sourceItemId: "integration/a2ui" };
function scenario(id: string, resources: MockScenarioResourceRequirement[] = [resource]): MockScenario { return { id, title: id, steps: [], resources }; }

describe("Scenario resources are the Creator source requirement authority", () => {
  it("derives the pluginless A2UI requirement from its Scenario", () => {
    const requirement = mockDemoRequirements.find(item => item.id === "a2ui");
    expect(requirement).toEqual({ id: "a2ui", name: "A2UI Official Integration", sourceItemId: "integration/a2ui", scenarioIds: ["a2ui-interactive-order"] });
    expect(requirement!.plugin).toBeUndefined();
    expect(installableScenarioSourceItemIds.has("integration/a2ui")).toBe(true);
  });
  it.each(["dialog", "form"])("derives %s source and Plugin readiness from its Scenario", kind => {
    const requirement = scenarioSourceResources.find(item => item.id === `frontend-tool-${kind}`);
    expect(requirement).toMatchObject({ sourceItemId: `demo/frontend-tool-${kind}`, plugin: { id: `frontend-tool-${kind}-demo` } });
  });
  it("merges identical Plugin readiness and rejects conflicting Plugin IDs, slots or presence", () => {
    const pluginResource = { ...resource, plugin: { id: "provider", slot: "body" } };
    const merged = collectScenarioResourceRequirements([scenario("first", [pluginResource]), scenario("second", [{ ...pluginResource, plugin: { ...pluginResource.plugin } }])]);
    expect(merged).toEqual([{ id: "a2ui", name: resource.label, sourceItemId: resource.sourceItemId, scenarioIds: ["first", "second"], plugin: { id: "provider", slot: "body" } }]);
    for (const conflicting of [
      resource,
      { ...resource, plugin: { id: "other", slot: "body" } },
      { ...resource, plugin: { id: "provider", slot: "other" } },
      { ...resource, plugin: { id: "provider" } },
    ]) {
      expect(() => collectScenarioResourceRequirements([scenario("first", [pluginResource]), scenario("second", [conflicting])])).toThrow(/conflict/i);
    }
    expect(() => collectScenarioResourceRequirements([scenario("first"), scenario("second", [pluginResource])])).toThrow(/conflict/i);
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
      expect(matching[0]!.plugin).toEqual(resource.plugin);
      expect(matching[0]!.scenarioIds).toContain(scenario.id);
    }
    for (const requirement of sourceRequirements) {
      const declaringIds = showcaseMockScenarios.filter(scenario => scenario.resources?.some(resource => resource.id === requirement.id && resource.sourceItemId === requirement.sourceItemId)).map(scenario => scenario.id);
      expect(requirement.scenarioIds).toEqual(declaringIds);
      const declaration = showcaseMockScenarios.flatMap(scenario => scenario.resources ?? []).find(resource => resource.id === requirement.id)!;
      expect(requirement.plugin).toEqual(declaration.plugin);
    }
    expect([...installableScenarioSourceItemIds]).toEqual([...new Set(sourceRequirements.map(item => item.sourceItemId))]);
    expect(mockDemoRequirements.filter(item => !item.sourceItemId).map(item => item.plugin?.id)).toEqual([
      "assistant-ui-reasoning", "assistant-ui-tool-group", "assistant-ui-tool-fallback", "chart-message", "job-progress-message", "agent-plan-message", "agent-status-message", "task-group",
    ]);
    expect(installableScenarioSourceItemIds.has("plugin/chart-message")).toBe(false);
  });
});
