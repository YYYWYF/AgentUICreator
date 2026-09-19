import { describe, expect, it } from "vitest";

import type { AppUIModel } from "../framework/contracts/app-ui-model";
import { platformMode } from "../framework/modes/platform";
import {
  applyAppUIOperations,
  planWorkspaceRegionMove,
} from "../scripts/ui-project/app-ui-operations";
import { projectWorkspaceTopology } from "../scripts/ui-project/workspace-topology";

const workspacePolicy = platformMode.workspace;

function branch(instanceId: string): AppUIModel["root"] {
  return {
    type: "panel",
    width: "minmax(0, 1fr)",
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
    expect(() => projectWorkspaceTopology(model, workspacePolicy)).toThrow(
      "WORKSPACE_TOPOLOGY_UNSUPPORTED",
    );
  });

  it("moves a left branch to an empty right Region without a placeholder", () => {
    const model = row(
      ["280px", "minmax(0, 1fr)"],
      ["history-main", "conversation-main"],
    );
    const operation = {
      type: "move_plugin_to" as const,
      instanceId: "history-main",
      placement: { type: "workspace_region" as const, region: "right" as const },
    };
    const plan = planWorkspaceRegionMove(model, operation, workspacePolicy);
    const moved = applyAppUIOperations(model, [operation], { workspacePolicy });

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
    expect(moved.root.children[0]).toMatchObject({ type: "panel", width: "minmax(0, 1fr)" });
    expect(moved.root.children[1]).toMatchObject({ type: "panel", width: "280px" });
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
      type: "move_plugin_to" as const,
      instanceId: "history-main",
      placement: { type: "workspace_region" as const, region: "left" as const },
    };
    const moved = applyAppUIOperations(model, [operation], { workspacePolicy });

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

  it("rejects occupied destinations and moving the required Center", () => {
    const threeRegions = row(
      ["280px", "minmax(0, 1fr)", "280px"],
      ["left-main", "conversation-main", "history-main"],
    );
    expect(() => planWorkspaceRegionMove(
      threeRegions,
      {
        type: "move_plugin_to",
        instanceId: "left-main",
        placement: { type: "workspace_region", region: "right" },
      },
      workspacePolicy,
    )).toThrow("AUTHORING_MOVE_INCOMPATIBLE");

    expect(() => planWorkspaceRegionMove(
      threeRegions,
      {
        type: "move_plugin_to",
        instanceId: "conversation-main",
        placement: { type: "workspace_region", region: "left" },
      },
      workspacePolicy,
    )).toThrow("AUTHORING_MOVE_INCOMPATIBLE");
  });
});
