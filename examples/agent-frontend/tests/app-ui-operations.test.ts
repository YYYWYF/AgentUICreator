import { describe, expect, it } from "vitest";

import {
  buildLayoutRefIndex,
  type AppUILayoutNode,
  type AppUIModel,
} from "../framework/contracts/app-ui-model";
import {
  AppUIOperationError,
  applyAppUIOperations,
} from "../scripts/ui-project/app-ui-operations";

function model(): AppUIModel {
  return {
    applicationPlugins: [],
    root: {
      type: "slot",
      plugins: [{
        id: "surface-main",
        pluginId: "surface",
        enabled: true,
        slots: { content: [] },
      }],
    },
  };
}

function labeledSlot(id: string): AppUILayoutNode {
  return {
    type: "slot",
    plugins: [{ id, pluginId: "fixture", enabled: true }],
  };
}

function labeledRow(gap: number): AppUILayoutNode {
  return { type: "row", gap, children: [{ type: "slot", plugins: [] }] };
}

function layoutRowsModel(): AppUIModel {
  return {
    root: {
      type: "row",
      children: [labeledRow(1), labeledRow(2), labeledRow(3)],
    },
  };
}

function stackModel(): AppUIModel {
  return {
    root: {
      type: "stack",
      activeIndex: 1,
      children: [labeledSlot("A"), labeledSlot("B"), labeledSlot("C")],
    },
  };
}

function slotLabels(node: AppUILayoutNode): string[] {
  if (node.type !== "row" && node.type !== "column" && node.type !== "stack") {
    throw new Error("fixture must be a child container");
  }
  return node.children.map((child) => {
    if (child.type !== "slot") throw new Error("fixture must contain Slots");
    return child.plugins[0]?.id ?? "empty";
  });
}

describe("AppUIModel semantic operations", () => {
  it("assigns deterministic preorder nodeRefs", () => {
    const root: AppUILayoutNode = {
      type: "panel",
      child: {
        type: "row",
        children: [
          { type: "slot", plugins: [] },
          { type: "stack", children: [{ type: "slot", plugins: [] }] },
        ],
      },
    };
    const first = buildLayoutRefIndex(root);
    const second = buildLayoutRefIndex(root);

    expect([...first.byPath.entries()]).toEqual([
      ["root", "l0"],
      ["root.child", "l1"],
      ["root.child.children[0]", "l2"],
      ["root.child.children[1]", "l3"],
      ["root.child.children[1].children[0]", "l4"],
    ]);
    expect([...second.byPath.entries()]).toEqual([...first.byPath.entries()]);
  });

  it("keeps nodeRefs bound to the starting snapshot across a batch", () => {
    const result = applyAppUIOperations(layoutRowsModel(), [
      {
        type: "move_layout_node",
        nodeRef: "l1",
        newParentRef: "l0",
        index: 2,
      },
      {
        type: "update_layout_node_props",
        nodeRef: "l5",
        set: { gap: 30 },
      },
      {
        type: "move_layout_node",
        nodeRef: "l3",
        newParentRef: "l0",
        index: 1,
      },
    ]);

    if (result.root.type !== "row") throw new Error("fixture");
    expect(result.root.children.map((child) => child.type === "row" ? child.gap : undefined))
      .toEqual([30, 2, 1]);
  });

  it("keeps a moved nodeRef valid for a later update", () => {
    const result = applyAppUIOperations(layoutRowsModel(), [
      {
        type: "move_layout_node",
        nodeRef: "l3",
        newParentRef: "l0",
      },
      {
        type: "update_layout_node_props",
        nodeRef: "l3",
        set: { gap: 42 },
      },
    ]);

    if (result.root.type !== "row") throw new Error("fixture");
    expect(result.root.children.at(-1)).toMatchObject({ type: "row", gap: 42 });
  });

  it("detaches a removed nodeRef", () => {
    expect(() => applyAppUIOperations({
      root: { type: "row", children: [labeledSlot("A"), labeledSlot("B")] },
    }, [
      { type: "remove_layout_node", nodeRef: "l2" },
      { type: "update_layout_node_props", nodeRef: "l2", set: {} },
    ])).toThrowError(expect.objectContaining({ code: "LAYOUT_REF_DETACHED" }));
  });

  it("detaches the old nodeRef after replacement", () => {
    expect(() => applyAppUIOperations({
      root: { type: "row", children: [labeledSlot("A"), labeledSlot("B")] },
    }, [
      {
        type: "replace_layout_node",
        nodeRef: "l2",
        node: { type: "slot", plugins: [] },
      },
      { type: "update_layout_node_props", nodeRef: "l2", set: {} },
    ])).toThrowError(expect.objectContaining({ code: "LAYOUT_REF_DETACHED" }));
  });

  it("allows a later operation to use a transaction localRef without persisting it", () => {
    const result = applyAppUIOperations({
      root: { type: "row", children: [{ type: "slot", plugins: [] }] },
    }, [
      {
        type: "insert_layout_node",
        parentRef: "l0",
        node: { type: "slot", localRef: "$new-slot", plugins: [] },
      },
      {
        type: "insert_plugin",
        plugin: { id: "history-main", pluginId: "history", enabled: true },
        target: { type: "layout_slot", slotRef: "$new-slot" },
      },
    ]);

    expect(JSON.stringify(result)).not.toContain("localRef");
    if (result.root.type !== "row") throw new Error("fixture");
    expect(result.root.children[1]).toEqual({
      type: "slot",
      plugins: [{ id: "history-main", pluginId: "history", enabled: true }],
    });
  });

  it("rejects nested duplicate localRefs during batch preflight", () => {
    expect(() => applyAppUIOperations({
      root: { type: "row", children: [] },
    }, [{
      type: "insert_layout_node",
      parentRef: "l0",
      node: {
        type: "row",
        localRef: "$same",
        children: [{ type: "slot", localRef: "$same", plugins: [] }],
      },
    }])).toThrowError(expect.objectContaining({ code: "DUPLICATE_LAYOUT_LOCAL_REF" }));
  });

  it("rejects duplicate localRefs across operations during batch preflight", () => {
    expect(() => applyAppUIOperations({
      root: { type: "row", children: [{ type: "slot", plugins: [] }] },
    }, [
      {
        type: "insert_layout_node",
        parentRef: "l0",
        node: { type: "slot", localRef: "$same", plugins: [] },
      },
      {
        type: "insert_layout_relative",
        anchorRef: "l1",
        direction: "right",
        node: { type: "slot", localRef: "$same", plugins: [] },
      },
    ])).toThrowError(expect.objectContaining({ code: "DUPLICATE_LAYOUT_LOCAL_REF" }));
  });

  it("rejects forward localRef references", () => {
    expect(() => applyAppUIOperations({
      root: { type: "row", children: [] },
    }, [
      {
        type: "insert_plugin",
        plugin: { id: "future-main", pluginId: "future", enabled: true },
        target: { type: "layout_slot", slotRef: "$future" },
      },
      {
        type: "insert_layout_node",
        parentRef: "l0",
        node: { type: "slot", localRef: "$future", plugins: [] },
      },
    ])).toThrowError(expect.objectContaining({ code: "LAYOUT_REF_NOT_FOUND" }));
  });

  it("places a relative root in all four directions", () => {
    for (const [direction, type, labels] of [
      ["left", "row", ["new", "old"]],
      ["right", "row", ["old", "new"]],
      ["above", "column", ["new", "old"]],
      ["below", "column", ["old", "new"]],
    ] as const) {
      const result = applyAppUIOperations({ root: labeledSlot("old") }, [{
        type: "insert_layout_relative",
        anchorRef: "l0",
        direction,
        node: labeledSlot("new") as Extract<AppUILayoutNode, { type: "slot" }>,
      }]);

      expect(result.root.type).toBe(type);
      expect(slotLabels(result.root)).toEqual(labels);
    }
  });

  it("flattens relative insertion into an existing matching Row", () => {
    const result = applyAppUIOperations({
      root: { type: "row", children: [labeledSlot("A"), labeledSlot("B")] },
    }, [{
      type: "insert_layout_relative",
      anchorRef: "l2",
      direction: "left",
      node: labeledSlot("X") as Extract<AppUILayoutNode, { type: "slot" }>,
    }]);

    expect(result.root.type).toBe("row");
    expect(slotLabels(result.root)).toEqual(["A", "X", "B"]);
    if (result.root.type !== "row") throw new Error("fixture");
    expect(result.root.children.every((child) => child.type !== "row")).toBe(true);
  });

  it("enforces deterministic relative sizing", () => {
    const sized = { root: {
      type: "row" as const,
      sizes: ["1fr", "1fr"],
      children: [labeledSlot("A"), labeledSlot("B")],
    } };
    expect(() => applyAppUIOperations(sized, [{
      type: "insert_layout_relative",
      anchorRef: "l2",
      direction: "left",
      node: labeledSlot("X") as Extract<AppUILayoutNode, { type: "slot" }>,
    }])).toThrowError(expect.objectContaining({ code: "LAYOUT_SIZE_REQUIRED" }));

    const sizedResult = applyAppUIOperations(sized, [{
      type: "insert_layout_relative",
      anchorRef: "l2",
      direction: "left",
      node: labeledSlot("X") as Extract<AppUILayoutNode, { type: "slot" }>,
      size: "2fr",
    }]);
    expect(sizedResult.root).toMatchObject({ sizes: ["1fr", "2fr", "1fr"] });

    const rootSlot = { root: labeledSlot("old") };
    expect(() => applyAppUIOperations(rootSlot, [{
      type: "insert_layout_relative",
      anchorRef: "l0",
      direction: "right",
      node: labeledSlot("new") as Extract<AppUILayoutNode, { type: "slot" }>,
      size: "1fr",
    }])).toThrowError(expect.objectContaining({ code: "LAYOUT_SIZES_INCOMPLETE" }));
    expect(() => applyAppUIOperations(rootSlot, [{
      type: "insert_layout_relative",
      anchorRef: "l0",
      direction: "right",
      node: labeledSlot("new") as Extract<AppUILayoutNode, { type: "slot" }>,
      anchorSize: "1fr",
    }])).toThrowError(expect.objectContaining({ code: "LAYOUT_SIZES_INCOMPLETE" }));

    const wrapper = applyAppUIOperations(rootSlot, [{
      type: "insert_layout_relative",
      anchorRef: "l0",
      direction: "right",
      node: labeledSlot("new") as Extract<AppUILayoutNode, { type: "slot" }>,
      size: "2fr",
      anchorSize: "1fr",
    }]);
    expect(wrapper.root).toMatchObject({ type: "row", sizes: ["1fr", "2fr"] });

    const unsized = applyAppUIOperations(rootSlot, [{
      type: "insert_layout_relative",
      anchorRef: "l0",
      direction: "right",
      node: labeledSlot("new") as Extract<AppUILayoutNode, { type: "slot" }>,
    }]);
    expect(unsized.root).toMatchObject({ type: "row" });
    if (unsized.root.type !== "row") throw new Error("fixture");
    expect(unsized.root.sizes).toBeUndefined();
  });

  it("preserves Stack active child identity across structural operations", () => {
    const inserted = applyAppUIOperations(stackModel(), [{
      type: "insert_layout_node",
      parentRef: "l0",
      index: 1,
      node: labeledSlot("D") as Extract<AppUILayoutNode, { type: "slot" }>,
    }]);
    expect(slotLabels(inserted.root)).toEqual(["A", "D", "B", "C"]);
    expect(inserted.root).toMatchObject({ activeIndex: 2 });

    const moved = applyAppUIOperations(stackModel(), [{
      type: "move_layout_node",
      nodeRef: "l2",
      newParentRef: "l0",
      index: 0,
    }]);
    expect(slotLabels(moved.root)).toEqual(["B", "A", "C"]);
    expect(moved.root).toMatchObject({ activeIndex: 0 });

    const removedBefore = applyAppUIOperations(stackModel(), [{
      type: "remove_layout_node",
      nodeRef: "l1",
    }]);
    expect(slotLabels(removedBefore.root)).toEqual(["B", "C"]);
    expect(removedBefore.root).toMatchObject({ activeIndex: 0 });

    const removedActive = applyAppUIOperations(stackModel(), [{
      type: "remove_layout_node",
      nodeRef: "l2",
    }]);
    expect(slotLabels(removedActive.root)).toEqual(["A", "C"]);
    expect(removedActive.root).toMatchObject({ activeIndex: 1 });

    const emptied = applyAppUIOperations({
      root: { type: "stack", activeIndex: 0, children: [labeledSlot("A")] },
    }, [{ type: "remove_layout_node", nodeRef: "l1" }]);
    expect(emptied.root).toMatchObject({ type: "stack", children: [] });
    if (emptied.root.type !== "stack") throw new Error("fixture");
    expect(emptied.root.activeIndex).toBeUndefined();
  });

  it("inserts directly into Layout and plugin-local Slots", () => {
    const result = applyAppUIOperations(model(), [
      {
        type: "insert_plugin",
        plugin: { id: "toolbar-main", pluginId: "toolbar", enabled: true },
        target: { type: "layout_slot", slotRef: "l0" },
        index: 0,
      },
      {
        type: "insert_plugin",
        plugin: { id: "item-main", pluginId: "item", enabled: true },
        target: {
          type: "plugin_slot",
          parentInstanceId: "surface-main",
          slot: "content",
        },
      },
    ]);

    expect(result.root.type).toBe("slot");
    if (result.root.type !== "slot") throw new Error("fixture");
    expect(result.root.plugins.map((plugin) => plugin.id)).toEqual([
      "toolbar-main",
      "surface-main",
    ]);
    expect(result.root.plugins[1]?.slots?.content?.[0]?.id).toBe("item-main");
  });

  it("moves a plugin subtree without exposing Runtime placement", () => {
    const result = applyAppUIOperations(model(), [{
      type: "move_plugin",
      instanceId: "surface-main",
      target: { type: "application" },
    }]);

    expect(result.applicationPlugins?.[0]?.id).toBe("surface-main");
    if (result.root.type !== "slot") throw new Error("fixture");
    expect(result.root.plugins).toEqual([]);
  });

  it("rejects moving a plugin into its own descendant", () => {
    expect(() => applyAppUIOperations(model(), [{
      type: "move_plugin",
      instanceId: "surface-main",
      target: {
        type: "plugin_slot",
        parentInstanceId: "surface-main",
        slot: "content",
      },
    }])).toThrow(AppUIOperationError);
  });

  it("updates, disables, replaces, and removes authoring plugin nodes", () => {
    const updated = applyAppUIOperations(model(), [
      {
        type: "update_plugin_props",
        instanceId: "surface-main",
        set: { title: "Surface" },
      },
      {
        type: "set_plugin_enabled",
        instanceId: "surface-main",
        enabled: false,
      },
      {
        type: "replace_plugin",
        instanceId: "surface-main",
        replacement: {
          id: "replacement-main",
          pluginId: "replacement",
          enabled: true,
        },
      },
    ]);
    if (updated.root.type !== "slot") throw new Error("fixture");
    expect(updated.root.plugins).toEqual([{
      id: "replacement-main",
      pluginId: "replacement",
      enabled: true,
    }]);

    const removed = applyAppUIOperations(updated, [{
      type: "remove_plugin",
      instanceId: "replacement-main",
    }]);
    if (removed.root.type !== "slot") throw new Error("fixture");
    expect(removed.root.plugins).toEqual([]);
  });

  it("preserves a dedicated Layout region for the default Plugin removal", () => {
    const source: AppUIModel = {
      root: {
        type: "row",
        sizes: ["280px", "1fr"],
        children: [
          { type: "slot", plugins: [{ id: "history-main", pluginId: "history", enabled: true }] },
          { type: "slot", plugins: [{ id: "surface-main", pluginId: "surface", enabled: true }] },
        ],
      },
    };

    const result = applyAppUIOperations(source, [{
      type: "remove_plugin",
      instanceId: "history-main",
    }]);

    expect(result.root).toEqual({
      type: "row",
      sizes: ["280px", "1fr"],
      children: [
        { type: "slot", plugins: [] },
        { type: "slot", plugins: [{ id: "surface-main", pluginId: "surface", enabled: true }] },
      ],
    });
  });

  it("collapses a dedicated visible region and its single-child wrapper", () => {
    const result = applyAppUIOperations({
      root: {
        type: "row",
        sizes: ["280px", "1fr"],
        children: [
          {
            type: "panel",
            width: "280px",
            child: {
              type: "slot",
              plugins: [{ id: "history-main", pluginId: "history", enabled: true }],
            },
          },
          { type: "slot", plugins: [{ id: "surface-main", pluginId: "surface", enabled: true }] },
        ],
      },
    }, [{
      type: "remove_plugin",
      instanceId: "history-main",
      reflow: "collapse-empty-region",
    }]);

    expect(result.root).toEqual({
      type: "slot",
      plugins: [{ id: "surface-main", pluginId: "surface", enabled: true }],
    });
  });

  it("synchronizes Row and Column tracks when reflow removes a middle region", () => {
    const result = applyAppUIOperations({
      root: {
        type: "row",
        sizes: ["200px", "280px", "1fr"],
        children: [
          { type: "slot", plugins: [{ id: "a-main", pluginId: "a", enabled: true }] },
          { type: "slot", plugins: [{ id: "history-main", pluginId: "history", enabled: true }] },
          { type: "slot", plugins: [{ id: "c-main", pluginId: "c", enabled: true }] },
        ],
      },
    }, [{
      type: "remove_plugin",
      instanceId: "history-main",
      reflow: "collapse-empty-region",
    }]);

    expect(result.root).toMatchObject({
      type: "row",
      sizes: ["200px", "1fr"],
      children: [
        { type: "slot", plugins: [{ id: "a-main" }] },
        { type: "slot", plugins: [{ id: "c-main" }] },
      ],
    });
  });

  it("fails closed for shared Layout Slots without mutating the source", () => {
    const source: AppUIModel = {
      root: {
        type: "row",
        children: [
          {
            type: "slot",
            plugins: [
              { id: "history-main", pluginId: "history", enabled: true },
              { id: "secondary-main", pluginId: "secondary", enabled: true },
            ],
          },
          { type: "slot", plugins: [{ id: "surface-main", pluginId: "surface", enabled: true }] },
        ],
      },
    };

    expect(() => applyAppUIOperations(source, [{
      type: "remove_plugin",
      instanceId: "history-main",
      reflow: "collapse-empty-region",
    }])).toThrowError(expect.objectContaining({ code: "LAYOUT_REFLOW_REGION_NOT_EMPTY" }));
    expect(source.root).toEqual({
      type: "row",
      children: [
        {
          type: "slot",
          plugins: [
            { id: "history-main", pluginId: "history", enabled: true },
            { id: "secondary-main", pluginId: "secondary", enabled: true },
          ],
        },
        { type: "slot", plugins: [{ id: "surface-main", pluginId: "surface", enabled: true }] },
      ],
    });
  });

  it("does not reflow Plugin-local Slots or cross a Stack", () => {
    expect(() => applyAppUIOperations({
      root: {
        type: "slot",
        plugins: [{
          id: "surface-main",
          pluginId: "surface",
          enabled: true,
          slots: {
            content: [{ id: "history-main", pluginId: "history", enabled: true }],
          },
        }],
      },
    }, [{
      type: "remove_plugin",
      instanceId: "history-main",
      reflow: "collapse-empty-region",
    }])).toThrowError(expect.objectContaining({ code: "LAYOUT_REFLOW_NOT_LAYOUT_REGION" }));

    expect(() => applyAppUIOperations({
      root: {
        type: "stack",
        children: [
          { type: "slot", plugins: [{ id: "history-main", pluginId: "history", enabled: true }] },
          { type: "slot", plugins: [{ id: "surface-main", pluginId: "surface", enabled: true }] },
        ],
      },
    }, [{
      type: "remove_plugin",
      instanceId: "history-main",
      reflow: "collapse-empty-region",
    }])).toThrowError(expect.objectContaining({ code: "LAYOUT_REFLOW_UNSUPPORTED_PARENT" }));
  });

  it("replaces a subtree while allowing its existing ids to be retained", () => {
    const result = applyAppUIOperations(model(), [{
      type: "replace_plugin",
      instanceId: "surface-main",
      replacement: {
        id: "surface-main",
        pluginId: "surface-v2",
        enabled: true,
        slots: {
          content: [{ id: "item-main", pluginId: "item", enabled: true }],
        },
      },
    }]);

    if (result.root.type !== "slot") throw new Error("fixture");
    expect(result.root.plugins[0]?.pluginId).toBe("surface-v2");
    expect(result.root.plugins[0]?.slots?.content?.[0]?.id).toBe("item-main");
  });
});
