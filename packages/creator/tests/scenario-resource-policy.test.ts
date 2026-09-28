import { showcaseMockScenarios, type MockScenario } from "@agent-ui/mock-agent";
import { describe, expect, it } from "vitest";
import { collectScenarioResourceRequirements, installableMockResourceIds, mockDemoRequirements } from "../src/mock/demo-compatibility.js";

function scenario(id: string, resources: string[] = ["a2ui"]): MockScenario { return { id, title: id, steps: [], resources }; }
describe("Scenario → Official Resource policy", () => {
  it("resolves A2UI's name from the catalog and merges both Demo memberships", () => {
    expect(mockDemoRequirements.find(item => item.id === "a2ui")).toEqual({ id: "a2ui", name: "A2UI", scenarioIds: expect.arrayContaining(["a2ui-interactive-order", "a2ui-form-controls"]) });
    expect(installableMockResourceIds.has("a2ui")).toBe(true);
    expect(installableMockResourceIds.has("integration/a2ui")).toBe(false);
  });
  it("deduplicates resource membership without accepting Scenario-owned metadata", () => {
    expect(collectScenarioResourceRequirements([scenario("order", ["a2ui", "a2ui"]), scenario("form")])).toEqual([{ id: "a2ui", name: "A2UI", scenarioIds: ["order", "form"] }]);
    const malformed = { id: "a2ui", label: "Other", sourceItemId: "integration/other" } as unknown as string;
    expect(() => collectScenarioResourceRequirements([scenario("bad", [malformed])])).toThrow();
  });
  it("rejects unknown Resource IDs during compatibility policy construction", () => {
    expect(() => collectScenarioResourceRequirements([scenario("bad", ["unknown-resource"])] )).toThrow(/Unknown official/);
  });
  it("covers every declared Resource with the same catalog-backed requirement", () => {
    for (const resource of mockDemoRequirements) {
      expect(resource.scenarioIds).toEqual(showcaseMockScenarios.filter(scenario => scenario.resources?.includes(resource.id)).map(scenario => scenario.id));
      expect(Object.keys(resource).sort()).toEqual(["id", "name", "scenarioIds"]);
    }
    expect(mockDemoRequirements).toEqual(collectScenarioResourceRequirements(showcaseMockScenarios));
    expect(new Set(mockDemoRequirements.map(resource => resource.id))).toEqual(new Set(showcaseMockScenarios.flatMap(scenario => scenario.resources ?? [])));
    expect(JSON.stringify(mockDemoRequirements)).not.toMatch(/sourceItemId|@assistant-ui|assistant-ui-/);
  });
});
