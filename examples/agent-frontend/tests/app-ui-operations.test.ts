import { describe, expect, it } from "vitest";

import type { AppUIModel } from "../framework/contracts/app-ui-model";
import {
  AppUIOperationError,
  applyAppUIOperations,
  buildLayoutNodeIndex,
} from "../scripts/ui-project/app-ui-operations";

function expectOperationError(action: () => unknown, code: string): void {
  try {
    action();
    throw new Error(`Expected AppUIOperationError ${code}`);
  } catch (error) {
    expect(error).toBeInstanceOf(AppUIOperationError);
    expect((error as AppUIOperationError).code).toBe(code);
  }
}

function baseModel(): AppUIModel {
  return {
    version: "2",
    root: {
      type: "row",
      id: "root",
      sizes: ["1fr", "1fr"],
      children: [
        {
          type: "slot",
          id: "main-node",
          slotId: "main",
        },
        {
          type: "column",
          id: "aside",
          children: [
            {
              type: "slot",
              id: "aside-node",
              slotId: "aside-slot",
            },
          ],
        },
      ],
    },
    slots: {
      main: {
        id: "main",
        kind: "list",
        scope: "root",
        description: "Primary list Slot.",
        owner: { type: "layout", nodeId: "main-node" },
        occupants: [{ instanceId: "sample-main", id: "primary" }],
      },
      "aside-slot": {
        id: "aside-slot",
        kind: "single",
        scope: "root",
        description: "Secondary Slot.",
        owner: { type: "layout", nodeId: "aside-node" },
        occupants: [],
      },
    },
    pluginInstances: {
      "sample-main": {
        id: "sample-main",
        pluginId: "sample",
        enabled: true,
      },
    },
  };
}

describe("AppUIModel semantic operations", () => {
  it("indexes every Layout node with a stable path and parent position", () => {
    const index = buildLayoutNodeIndex(baseModel().root);

    expect(index.get("root")).toMatchObject({ path: "root", parentKind: "root" });
    expect(index.get("aside-node")).toMatchObject({
      path: "root.children[1].children[0]",
      parentKind: "children",
      index: 0,
    });
  });

  it("applies a multi-operation instance change without requiring valid intermediate state", () => {
    const result = applyAppUIOperations(baseModel(), [
      {
        type: "add_instance",
        instance: {
          id: "secondary",
          pluginId: "sample",
          enabled: true,
        },
      },
      {
        type: "mount_instance",
        instanceId: "secondary",
        slotId: "aside-slot",
      },
      {
        type: "update_instance_props",
        instanceId: "secondary",
        set: { title: "Secondary", count: 2 },
      },
      {
        type: "move_instance",
        instanceId: "secondary",
        slotId: "main",
        index: 0,
        id: "secondary",
      },
    ]);

    expect(result.pluginInstances.secondary).toMatchObject({
      enabled: true,
      props: { title: "Secondary", count: 2 },
    });
    expect(result.slots.main?.occupants).toEqual([
      { instanceId: "secondary", id: "secondary" },
      { instanceId: "sample-main", id: "primary" },
    ]);
  });

  it("keeps row and column sizes aligned while inserting, moving, and removing nodes", () => {
    const result = applyAppUIOperations(baseModel(), [
      {
        type: "add_slot",
        slot: {
          id: "temporary",
          kind: "single",
          scope: "root",
          description: "Temporary Layout Slot.",
          owner: { type: "layout", nodeId: "temporary-node" },
          occupants: [],
        },
      },
      {
        type: "insert_layout_node",
        parentNodeId: "root",
        index: 1,
        size: "12rem",
        node: {
          type: "slot",
          id: "temporary-node",
          slotId: "temporary",
        },
      },
      {
        type: "move_layout_node",
        nodeId: "temporary-node",
        newParentNodeId: "aside",
        index: 0,
      },
      {
        type: "remove_layout_node",
        nodeId: "aside-node",
      },
      {
        type: "update_layout_node_props",
        nodeId: "root",
        set: { gap: 12 },
      },
    ]);
    const root = result.root;
    const aside = buildLayoutNodeIndex(root).get("aside")?.node;

    expect(root).toMatchObject({
      type: "row",
      sizes: ["1fr", "1fr"],
      gap: 12,
    });
    expect(aside).toMatchObject({
      type: "column",
      children: [expect.objectContaining({ id: "temporary-node" })],
    });
  });

  it("replaces mounted instances and Layout nodes without losing retained mounts", () => {
    const result = applyAppUIOperations(baseModel(), [
      {
        type: "replace_instance",
        instanceId: "sample-main",
        replacement: {
          id: "sample-replacement",
          pluginId: "sample",
          enabled: true,
        },
      },
      {
        type: "add_slot",
        slot: {
          id: "replacement-main",
          kind: "list",
          scope: "root",
          description: "Replacement Layout Slot.",
          owner: { type: "layout", nodeId: "replacement-main-node" },
          occupants: [],
        },
      },
      {
        type: "move_instance",
        instanceId: "sample-replacement",
        slotId: "replacement-main",
      },
      {
        type: "replace_layout_node",
        nodeId: "main-node",
        node: {
          type: "slot",
          id: "replacement-main-node",
          slotId: "replacement-main",
        },
      },
    ]);

    expect(result.pluginInstances["sample-main"]).toBeUndefined();
    expect(result.pluginInstances["sample-replacement"]).toMatchObject({
      enabled: true,
    });
    const replacementNode = buildLayoutNodeIndex(result.root).get(
      "replacement-main-node",
    )?.node;
    expect(replacementNode?.type).toBe("slot");
    expect(
      replacementNode?.type === "slot"
        ? {
            slotId: replacementNode.slotId,
            occupants: result.slots[replacementNode.slotId]?.occupants,
          }
        : undefined,
    ).toEqual({
      slotId: "replacement-main",
      occupants: [{ instanceId: "sample-replacement", id: "primary" }],
    });
  });

  it("requires explicit handling before a mounted Layout subtree disappears", () => {
    expectOperationError(() =>
      applyAppUIOperations(baseModel(), [
        { type: "remove_layout_node", nodeId: "main-node" },
      ]),
      "LAYOUT_SUBTREE_HAS_MOUNTED_INSTANCES",
    );

    const result = applyAppUIOperations(baseModel(), [
      { type: "unmount_instance", instanceId: "sample-main" },
      { type: "remove_layout_node", nodeId: "main-node" },
      { type: "remove_slot", slotId: "main" },
      { type: "remove_instance", instanceId: "sample-main" },
    ]);
    expect(buildLayoutNodeIndex(result.root).has("main-node")).toBe(false);
    expect(result.pluginInstances).toEqual({});
  });

  it("restricts layout property edits to non-structural fields", () => {
    expectOperationError(() =>
      applyAppUIOperations(baseModel(), [
        {
          type: "update_layout_node_props",
          nodeId: "main-node",
          set: { slotId: "renamed" },
        },
      ]),
      "LAYOUT_PROP_NOT_MUTABLE",
    );
  });
});
