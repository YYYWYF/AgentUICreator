import { describe, expect, it, vi } from "vitest";
import { inspectMockDemoCompatibility, inspectMockProjectCompatibility, mockDemoRequirements, type ProjectCompositionInspection } from "../src/mock/demo-compatibility.js";

const sources = { items: mockDemoRequirements.filter(item => item.sourceItemId).map(item => ({ id: item.sourceItemId!, status: "managed", requirements: [] })) };
const empty: ProjectCompositionInspection = { pluginSources: [], pluginInstances: [] };
function status(snapshot: ProjectCompositionInspection, pluginId: string) {
  return inspectMockDemoCompatibility(snapshot, sources).requirements.find(requirement => requirement.pluginId === pluginId)?.status;
}

describe("Mock requirements from formal inspection", () => {
  it.each(mockDemoRequirements)("checks $pluginId source, activation and renderer placement", requirement => {
    const snapshot: ProjectCompositionInspection = {
      pluginSources: [{ pluginId: requirement.pluginId, status: "available", dataMessageUINames: ["chart"] }],
      pluginInstances: [],
    };
    expect(status(empty, requirement.pluginId)).toBe("missing");
    expect(status(snapshot, requirement.pluginId)).toBe("disabled");
    const parent = { id: "surface", pluginId: "conversation-surface", enabled: true, effectiveEnabled: true, target: { type: "application" } };
    const instance = { id: "demo", pluginId: requirement.pluginId, enabled: true, effectiveEnabled: false, target: { type: "plugin_slot", parentInstanceId: "surface", slot: requirement.slot ?? "body" } };
    snapshot.pluginInstances = [parent, instance];
    expect(status(snapshot, requirement.pluginId)).toBe("disabled");
    instance.effectiveEnabled = true;
    expect(status(snapshot, requirement.pluginId)).toBe("ready");
    if (requirement.slot) {
      instance.target.slot = "wrong";
      expect(status(snapshot, requirement.pluginId)).toBe("disabled");
      instance.target.slot = requirement.slot;
      parent.pluginId = "other";
      expect(status(snapshot, requirement.pluginId)).toBe("disabled");
    }
  });

  it("requires formal chart renderer registration and rejects partial sources", () => {
    const snapshot: ProjectCompositionInspection = { pluginSources: [{ pluginId: "chart-message", status: "available" as const, dataMessageUINames: [] }], pluginInstances: [] };
    expect(status(snapshot, "chart-message")).toBe("missing");
    snapshot.pluginSources[0]!.dataMessageUINames = ["chart"];
    expect(inspectMockDemoCompatibility(snapshot, { items: [{ id: "plugin/chart-message", status: "partial" }] }).requirements.find(r => r.pluginId === "chart-message")?.status).toBe("missing");
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
    const bundle = { id: "demo/frontend-tool-form", status: "not-installed", requirements: [{ name: "react-hook-form", required: "^7", compatible: false }] };
    const inspect = () => inspectMockDemoCompatibility(snapshot, { items: [bundle] }).requirements.find(item => item.pluginId === pluginId)!;
    expect(inspect().status).toBe("missing");
    expect(inspect().missingPackages).toEqual([{ name: "react-hook-form", required: "^7" }]);
    bundle.status = "managed"; bundle.requirements[0]!.compatible = true;
    expect(inspect().status).toBe("ready");
    bundle.status = "partial"; expect(inspect().status).toBe("missing");
    bundle.status = "managed"; snapshot.pluginInstances[0]!.effectiveEnabled = false;
    expect(inspect().status).toBe("disabled");
  });
});
