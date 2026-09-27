import { describe, expect, it } from "vitest";
import { createOfficialResourceRegistry, loadAgentUISourceRegistry, officialResourceRegistry, resolveOfficialResource, validateOfficialResourceSources, type OfficialAgentUIResource } from "../src/index.js";
describe("Official Resource Catalog", () => {
  it("keeps stable product IDs above implementation metadata", () => {
    expect(resolveOfficialResource("a2ui")).toMatchObject({ id: "a2ui", label: "A2UI", implementation: { type: "source", sourceItemId: "integration/a2ui" } });
    expect(resolveOfficialResource("frontend-tool-form-demo").implementation).toMatchObject({ type: "source-plugin", sourceItemId: "demo/frontend-tool-form", pluginId: "frontend-tool-form-demo" });
    expect(new Set(officialResourceRegistry.resources.map(resource => resource.id)).size).toBe(officialResourceRegistry.resources.length);
    expect(() => resolveOfficialResource("integration/a2ui")).toThrow(/Unknown official/);
  });
  it("validates real source items and Plugin definitions", async () => {
    const sources = await loadAgentUISourceRegistry();
    expect(() => validateOfficialResourceSources(sources)).not.toThrow();
    expect(() => validateOfficialResourceSources({ ...sources, byId: new Map() })).toThrow(/unavailable source/);
  });
  it("rejects duplicate IDs, empty labels and conflicting implementations", () => {
    const a2ui = resolveOfficialResource("a2ui");
    expect(() => createOfficialResourceRegistry([a2ui, a2ui])).toThrow(/Duplicate/);
    expect(() => createOfficialResourceRegistry([{ ...a2ui, label: " " }])).toThrow(/Invalid/);
    expect(() => createOfficialResourceRegistry([a2ui, { ...a2ui, id: "other" }])).toThrow(/Conflicting/);
    const bad = { id: "bad", label: "Bad", implementation: { type: "plugin", pluginId: "", slot: "body" } } as OfficialAgentUIResource;
    expect(() => createOfficialResourceRegistry([bad])).toThrow(/Invalid/);
  });
  it("prevents callers from redefining resource metadata", () => {
    expect(Object.isFrozen(resolveOfficialResource("a2ui"))).toBe(true);
    expect(Object.isFrozen(resolveOfficialResource("a2ui").implementation)).toBe(true);
  });
});
