import { describe, expect, it, vi } from "vitest";
import { resolveOfficialResource } from "@agent-ui/project-control/resources";
import { inspectMockDemoCompatibility, inspectMockProjectCompatibility, mockDemoRequirements, type ProjectCompositionInspection } from "../src/mock/demo-compatibility.js";
const empty: ProjectCompositionInspection = { pluginSources: [], pluginInstances: [] };
const sources = { items: mockDemoRequirements.map(requirement => {
  const implementation = resolveOfficialResource(requirement.id).implementation;
  return { id: "sourceItemId" in implementation ? implementation.sourceItemId : `plugin/${implementation.pluginId}`, status: "managed", resolvedRequirements: [] };
}) };
const status = (composition: ProjectCompositionInspection, id: string) => inspectMockDemoCompatibility(composition, sources).requirements.find(requirement => requirement.id === id)?.status;

describe("Official Resource readiness projection", () => {
  it.each(mockDemoRequirements)("checks $id source, activation, slot and parent through the catalog", requirement => {
    const implementation = resolveOfficialResource(requirement.id).implementation;
    if (implementation.type === "source") { expect(status(empty, requirement.id)).toBe("ready"); return; }
    const snapshot: ProjectCompositionInspection = { pluginSources: [{ pluginId: implementation.pluginId, status: "available", dataMessageUINames: ["chart"] }], pluginInstances: [] };
    expect(status(empty, requirement.id)).toBe("missing");
    expect(status(snapshot, requirement.id)).toBe("disabled");
    const parent = { id: "surface", pluginId: "conversation-surface", enabled: true, effectiveEnabled: true, target: { type: "application" } };
    const expectedTarget = implementation.type === "source-plugin" ? implementation.placement : implementation.slot ? "plugin-slot" : "layout";
    const instance = { id: "demo", pluginId: implementation.pluginId, enabled: true, effectiveEnabled: false, target: { type: expectedTarget === "application" ? "application" : expectedTarget === "plugin-slot" ? "plugin_slot" : "layout_slot", parentInstanceId: "surface", slot: implementation.slot ?? "body" } };
    snapshot.pluginInstances = [parent, instance];
    expect(status(snapshot, requirement.id)).toBe("disabled");
    instance.effectiveEnabled = true;
    expect(status(snapshot, requirement.id)).toBe("ready");
    if (implementation.slot) {
      instance.target.slot = "wrong"; expect(status(snapshot, requirement.id)).toBe("disabled");
      instance.target.slot = implementation.slot; parent.pluginId = "other";
      expect(status(snapshot, requirement.id)).toBe("disabled");
    } else if (implementation.type === "source-plugin") {
      instance.target.type = implementation.placement === "application" ? "layout_slot" : "application";
      expect(status(snapshot, requirement.id)).toBe("disabled");
    }
  });
  it("requires real chart registration and rejects partial Plugin source", () => {
    const snapshot: ProjectCompositionInspection = { pluginSources: [{ pluginId: "chart-message", status: "available", dataMessageUINames: [] }], pluginInstances: [] };
    expect(status(snapshot, "chart-message")).toBe("missing");
    snapshot.pluginSources[0]!.dataMessageUINames = ["chart"];
    expect(inspectMockDemoCompatibility(snapshot, { items: [{ id: "plugin/chart-message", status: "partial" }] }).requirements.find(item => item.id === "chart-message")?.status).toBe("missing");
  });
  it("projects missing dependencies as installable, incompatible existing versions as conflicts, and stale integration files as missing", () => {
    const item = { id: "integration/a2ui", status: "managed", dependencies: ["integration/generative-ui"], resolvedRequirements: [{ name: "@assistant-ui/react-generative-ui", required: "0.0.21", compatible: false }] };
    const sources = { integrationRegistryReady: true, items: [item, { id: "integration/generative-ui", status: "managed", resolvedRequirements: [] }] };
    const inspect = () => inspectMockDemoCompatibility(empty, sources).requirements.find(item => item.id === "a2ui")!;
    expect(inspect()).toMatchObject({ id: "a2ui", name: "A2UI", status: "missing", installable: true });
    item.resolvedRequirements = [{ name: "@assistant-ui/react-generative-ui", required: "0.0.21", compatible: true }];
    expect(inspect().status).toBe("ready");
    sources.integrationRegistryReady = false; expect(inspect().status).toBe("missing");
    sources.integrationRegistryReady = true;
    sources.items[1]!.status = "partial"; expect(inspect().status).toBe("missing");
    sources.items[1]!.status = "managed";
    const conflict = { ...item, resolvedRequirements: [{ name: "@assistant-ui/react-generative-ui", required: "0.0.21", installed: "0.0.18", declared: "0.0.18", compatible: false }] };
    expect(inspectMockDemoCompatibility(empty, { items: [conflict] }).requirements.find(item => item.id === "a2ui")).toMatchObject({ status: "conflict", installable: false, issue: { code: "RESOURCE_CONFLICT" } });
    for (const token of ["sourceItemId", "missingPackages", "@assistant-ui", "react-markdown", "remark-gfm", "integration/a2ui", "pluginId"]) expect(JSON.stringify(inspect())).not.toContain(token);
  });
  it("returns unknown when formal inspection is unavailable", async () => {
    const inspector = vi.fn().mockRejectedValue(new Error("CONTROL_ENTRY_MISSING"));
    expect(await inspectMockProjectCompatibility(undefined, inspector)).toEqual({ projectId: null, status: "unknown", requirements: [] });
    expect(inspector).not.toHaveBeenCalled();
    expect(await inspectMockProjectCompatibility({ id: "host", projectRoot: "/fresh-host" }, inspector)).toEqual({ projectId: "host", status: "unknown", requirements: [] });
  });
});
