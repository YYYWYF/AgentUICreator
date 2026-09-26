import { describe, expect, it, vi } from "vitest";
import { inspectMockDemoCompatibility, inspectMockProjectCompatibility, mockDemoRequirements, type ProjectCompositionInspection } from "../src/mock/demo-compatibility.js";

const sources = { items: mockDemoRequirements.filter(item => item.sourceItemId).map(item => ({ id: item.sourceItemId!, status: "managed", resolvedRequirements: [] })) };
const empty: ProjectCompositionInspection = { pluginSources: [], pluginInstances: [] };
function statusByResource(snapshot: ProjectCompositionInspection, id: string) {
  return inspectMockDemoCompatibility(snapshot, sources).requirements.find(requirement => requirement.id === id)?.status;
}

describe("Mock requirements from formal inspection", () => {
  it.each(mockDemoRequirements)("checks $id source, activation and renderer placement", requirement => {
    const plugin = requirement.plugin;
    if (!plugin) {
      expect(statusByResource(empty, requirement.id)).toBe("ready");
      return;
    }
    const snapshot: ProjectCompositionInspection = {
      pluginSources: [{ pluginId: plugin.id, status: "available", dataMessageUINames: ["chart"] }],
      pluginInstances: [],
    };
    expect(statusByResource(empty, requirement.id)).toBe("missing");
    expect(statusByResource(snapshot, requirement.id)).toBe("disabled");
    const parent = { id: "surface", pluginId: "conversation-surface", enabled: true, effectiveEnabled: true, target: { type: "application" } };
    const instance = { id: "demo", pluginId: plugin.id, enabled: true, effectiveEnabled: false, target: { type: "plugin_slot", parentInstanceId: "surface", slot: plugin.slot ?? "body" } };
    snapshot.pluginInstances = [parent, instance];
    expect(statusByResource(snapshot, requirement.id)).toBe("disabled");
    instance.effectiveEnabled = true;
    expect(statusByResource(snapshot, requirement.id)).toBe("ready");
    if (plugin.slot) {
      instance.target.slot = "wrong";
      expect(statusByResource(snapshot, requirement.id)).toBe("disabled");
      instance.target.slot = plugin.slot;
      parent.pluginId = "other";
      expect(statusByResource(snapshot, requirement.id)).toBe("disabled");
    }
  });

  it("requires formal chart renderer registration and rejects partial sources", () => {
    const snapshot: ProjectCompositionInspection = { pluginSources: [{ pluginId: "chart-message", status: "available" as const, dataMessageUINames: [] }], pluginInstances: [] };
    expect(statusByResource(snapshot, "chart-message")).toBe("missing");
    snapshot.pluginSources[0]!.dataMessageUINames = ["chart"];
    expect(inspectMockDemoCompatibility(snapshot, { items: [{ id: "plugin/chart-message", status: "partial" }] }).requirements.find(r => r.plugin?.id === "chart-message")?.status).toBe("missing");
  });

  it("returns unknown without reading files when inspection is unavailable", async () => {
    const inspector = vi.fn().mockRejectedValue(new Error("CONTROL_ENTRY_MISSING"));
    expect(await inspectMockProjectCompatibility(undefined, inspector)).toEqual({ projectId: null, status: "unknown", requirements: [] });
    expect(inspector).not.toHaveBeenCalled();
    expect(await inspectMockProjectCompatibility({ id: "host", projectRoot: "/fresh-host" }, inspector)).toEqual({ projectId: "host", status: "unknown", requirements: [] });
  });
});

describe("Scenario Resource readiness", () => {
  it("requires complete bundle, compatible packages and active provider", () => {
    const pluginId = "frontend-tool-form-demo";
    const snapshot: ProjectCompositionInspection = {
      pluginSources: [{ pluginId, status: "available", dataMessageUINames: [] }],
      pluginInstances: [{ id: "form", pluginId, enabled: true, effectiveEnabled: true, target: { type: "layout_slot" } }],
    };
    const bundle = { id: "demo/frontend-tool-form", status: "not-installed", resolvedRequirements: [{ name: "react-hook-form", required: "^7", compatible: false }] };
    const inspect = () => inspectMockDemoCompatibility(snapshot, { items: [bundle] }).requirements.find(item => item.id === "frontend-tool-form")!;
    expect(inspect().status).toBe("missing");
    expect(inspect().missingPackages).toEqual([{ name: "react-hook-form", required: "^7" }]);
    bundle.status = "managed"; bundle.resolvedRequirements[0]!.compatible = true;
    expect(inspect().status).toBe("ready");
    bundle.status = "partial"; expect(inspect().status).toBe("missing");
    bundle.status = "managed"; snapshot.pluginInstances[0]!.effectiveEnabled = false;
    expect(inspect().status).toBe("disabled");
  });
});

it("checks transitive package blockers and pluginless resources", () => {
  const resource = { id: "form-contract", name: "React Hook Form Integration", sourceItemId: "integration/react-hook-form", scenarioIds: [] };
  const item = { id: resource.sourceItemId, status: "managed", dependencies: ["foundation/core-runtime"], resolvedRequirements: [
    { name: "react-hook-form", required: "^7", compatible: true },
    { name: "@assistant-ui/react-hook-form", required: "0.12.34", compatible: false },
  ] };
  const sources = { items: [item, { id: "foundation/core-runtime", status: "managed" }] };
  const inspect = () => inspectMockDemoCompatibility(empty, sources, null, [resource]).requirements[0]!;
  expect(inspect().status).toBe("missing");
  expect(inspect().missingPackages).toEqual([{ name: "@assistant-ui/react-hook-form", required: "0.12.34" }]);
  item.resolvedRequirements[1]!.compatible = true;
  expect(inspect().status).toBe("ready");
  item.resolvedRequirements[0]!.compatible = false;
  expect(inspect().missingPackages).toEqual([{ name: "react-hook-form", required: "^7" }]);
  item.resolvedRequirements[0]!.compatible = true;
  sources.items[1]!.status = "partial";
  expect(inspect().status).toBe("missing");
});
