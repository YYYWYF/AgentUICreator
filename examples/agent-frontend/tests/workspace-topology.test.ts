import { describe, expect, it } from "vitest";

import type { AppUIModel } from "../framework/contracts/app-ui-model";
import { platformMode } from "../framework/modes/platform";
import {
  applyAppUIOperations,
  lowerWorkspaceRegionMovePlan,
  planWorkspaceRegionMove,
} from "../scripts/ui-project/app-ui-operations";
import { projectWorkspaceTopology } from "../scripts/ui-project/workspace-topology";

const workspacePolicy = platformMode.workspace;
const centerOnlyPolicy = {
  regions: { center: platformMode.workspace.regions.center! },
};

function branch(instanceId: string): AppUIModel["root"] {
  return {
    type: "panel",
    child: {
      type: "slot",
      plugins: [{ id: instanceId, pluginId: instanceId.replace(/-main$/u, ""), enabled: true }],
    },
  };
}

function row(
  sizes: string[],
  instanceIds: string[],
): AppUIModel {
  return {
    root: {
      type: "row",
      sizes,
      children: instanceIds.map((instanceId) => branch(instanceId)),
    },
  };
}

function regionNames(model: AppUIModel): string[] {
  const topology = projectWorkspaceTopology(model, workspacePolicy);
  return ["left", "center", "right"].filter(
    (region) => topology.regions[region as keyof typeof topology.regions] !== undefined,
  );
}

describe("Workspace topology", () => {
  it.each([
    [["minmax(0, 1fr)"], ["center"]],
    [["280px", "minmax(0, 1fr)"], ["left", "center"]],
    [["minmax(0, 1fr)", "280px"], ["center", "right"]],
    [["280px", "minmax(0, 1fr)", "280px"], ["left", "center", "right"]],
  ])("projects sparse topology %j", (sizes, expectedRegions) => {
    expect(regionNames(row(sizes, expectedRegions.map((region) => `${region}-main`)))).toEqual(
      expectedRegions,
    );
  });

  it.each([
    row(["280px", "minmax(0, 1fr)", "280px", "280px"], ["a-main", "b-main", "c-main", "d-main"]),
    row(["minmax(0, 1fr)", "minmax(0, 1fr)"], ["a-main", "b-main"]),
    row(["280px", "280px"], ["a-main", "b-main"]),
    row(["280px", "280px", "minmax(0, 1fr)"], ["a-main", "b-main", "c-main"]),
  ])("fails closed for unsupported topology", (model) => {
    expect(() => projectWorkspaceTopology(model, workspacePolicy)).toThrowError(
      expect.objectContaining({ code: "WORKSPACE_TOPOLOGY_UNSUPPORTED" }),
    );
  });

  it("supports a future Center-only policy without inventing side Regions", () => {
    const topology = projectWorkspaceTopology(
      row(["minmax(0, 1fr)"], ["conversation-main"]),
      centerOnlyPolicy,
    );
    expect(Object.keys(topology.regions)).toEqual(["center"]);
  });

  it("moves a left branch to an empty right Region without a placeholder", () => {
    const model = row(
      ["280px", "minmax(0, 1fr)"],
      ["history-main", "conversation-main"],
    );
    const operation = {
      type: "workspace_region_move" as const,
      instanceId: "history-main",
      region: "right" as const,
    };
    const plan = planWorkspaceRegionMove(model, operation, workspacePolicy);
    const moved = applyAppUIOperations(
      model,
      lowerWorkspaceRegionMovePlan(plan),
      { workspacePolicy },
    );

    expect(plan.expectedPlacement).toEqual({
      type: "relative",
      instanceId: "history-main",
      anchorInstanceId: "conversation-main",
      relation: "after",
    });
    expect(moved.root).toMatchObject({
      type: "row",
      sizes: ["minmax(0, 1fr)", "280px"],
    });
    if (moved.root.type !== "row") throw new Error("Expected Row root.");
    expect(moved.root.children[0]).toMatchObject({ type: "panel" });
    expect(moved.root.children[1]).toMatchObject({ type: "panel" });
    expect(moved.root.children.every((child) => child.type === "panel" && child.width === undefined)).toBe(true);
    expect(
      moved.root.children.map((child) =>
        child.type === "panel" && child.child.type === "slot"
          ? child.child.plugins[0]?.id
          : undefined,
      ),
    ).toEqual(["conversation-main", "history-main"]);
  });

  it("moves a right branch to an empty left Region", () => {
    const model = row(
      ["minmax(0, 1fr)", "280px"],
      ["conversation-main", "history-main"],
    );
    const operation = {
      type: "workspace_region_move" as const,
      instanceId: "history-main",
      region: "left" as const,
    };
    const moved = applyAppUIOperations(
      model,
      lowerWorkspaceRegionMovePlan(
        planWorkspaceRegionMove(model, operation, workspacePolicy),
      ),
      { workspacePolicy },
    );

    expect(moved.root).toMatchObject({
      type: "row",
      sizes: ["280px", "minmax(0, 1fr)"],
    });
    if (moved.root.type !== "row") throw new Error("Expected Row root.");
    expect(
      moved.root.children.map((child) =>
        child.type === "panel" && child.child.type === "slot"
          ? child.child.plugins[0]?.id
          : undefined,
      ),
    ).toEqual(["history-main", "conversation-main"]);
  });

  it("clears a legacy direct Panel width only when one is present", () => {
    const model = row(["280px", "minmax(0, 1fr)"], ["history-main", "conversation-main"]);
    if (model.root.type !== "row" || model.root.children[0]?.type !== "panel") throw new Error("fixture");
    model.root.children[0].width = "280px";
    const center = model.root.children[1];
    if (center?.type !== "panel") throw new Error("fixture");
    center.width = "280px";
    const plan = planWorkspaceRegionMove(model, {
      type: "workspace_region_move", instanceId: "history-main", region: "right",
    }, workspacePolicy);
    expect(lowerWorkspaceRegionMovePlan(plan)).toEqual([
      expect.objectContaining({ type: "move_layout_node", size: "280px" }),
      { type: "update_layout_node_props", nodeRef: plan.branchRef, removeKeys: ["width"] },
      { type: "update_layout_node_props", nodeRef: "l3", removeKeys: ["width"] },
    ]);
    const moved = applyAppUIOperations(model, lowerWorkspaceRegionMovePlan(plan), { workspacePolicy });
    if (moved.root.type !== "row") throw new Error("Expected Row root.");
    expect(moved.root.sizes).toEqual(["minmax(0, 1fr)", "280px"]);
    const movedBranch = moved.root.children[1];
    if (movedBranch?.type !== "panel") throw new Error("Expected Panel branch.");
    expect(movedBranch.width).toBeUndefined();
    const movedCenter = moved.root.children[0];
    if (movedCenter?.type !== "panel") throw new Error("Expected Center Panel.");
    expect(movedCenter.width).toBeUndefined();
  });

  it("rejects occupied destinations and moving the required Center", () => {
    const threeRegions = row(
      ["280px", "minmax(0, 1fr)", "280px"],
      ["left-main", "conversation-main", "history-main"],
    );
    expect(() => planWorkspaceRegionMove(
      threeRegions,
      {
        type: "workspace_region_move",
        instanceId: "left-main",
        region: "right",
      },
      workspacePolicy,
    )).toThrowError(expect.objectContaining({ code: "AUTHORING_MOVE_INCOMPATIBLE" }));

    expect(() => planWorkspaceRegionMove(
      threeRegions,
      {
        type: "workspace_region_move",
        instanceId: "conversation-main",
        region: "left",
      },
      workspacePolicy,
    )).toThrowError(expect.objectContaining({ code: "AUTHORING_MOVE_INCOMPATIBLE" }));
  });
});
