import { showcaseMockScenarios, type MockScenario } from "@za38.03/agent-ui-creator/mock-agent";
import { describe, expect, it } from "vitest";
import { collectScenarioResourceRequirements, installableMockResourceIds, mockDemoRequirements } from "../src/mock/demo-compatibility.js";

function scenario(id: string, resources: string[] = ["web-search"]): MockScenario { return { id, title: id, steps: [], resources }; }
describe("Scenario → Official Resource policy", () => {
  it("does not advertise deferred A2UI resources or examples", () => {
    expect(mockDemoRequirements.some(item => item.id === "a2ui")).toBe(false);
    expect(showcaseMockScenarios.some(item => item.id.startsWith("a2ui-"))).toBe(false);
    expect(installableMockResourceIds.has("a2ui")).toBe(false);
  });
  it("deduplicates resource membership without accepting Scenario-owned metadata", () => {
    expect(collectScenarioResourceRequirements([scenario("order", ["web-search", "web-search"]), scenario("form")])).toEqual([{ id: "web-search", name: "网页搜索", scenarioIds: ["order", "form"] }]);
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
