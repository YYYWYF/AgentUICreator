import { describe, expect, it } from "vitest";

import {
  buildLayoutRefIndex,
  type AppUILayoutNode,
  type AppUIPanelNode,
  type AppUIModel,
} from "../framework/contracts/app-ui-model";
import {
  AppUIOperationError,
  appUIOperationsSchema,
  applyAppUIOperations,
  planPluginMove,
  relativeInsertionIndex,
  resolveDefaultPluginRemovalReflow,
} from "../scripts/ui-project/app-ui-operations";

function pluginMoveContracts(
  slotOverrides: Record<string, Record<string, {
    description: string;
    cardinality: "one" | "many";
    optional?: boolean;
    accepts?: { anyOfCapabilities: readonly string[] };
  }>> = {},
) {
  return {
    pluginCapabilities: new Map<string, readonly string[]>([
      ["button", ["button", "composer-action"]],
      ["badge", ["badge"]],
      ["composer", ["composer"]],
      ["toolbar", ["toolbar"]],
    ]),
    pluginSlots: slotOverrides,
  };
}

function visualBranch(
  id: string,
  pluginId = id,
  overrides: Omit<AppUIPanelNode, "type" | "child"> = {},
): AppUIPanelNode {
  return {
    type: "panel",
    ...overrides,
    child: {
      type: "slot",
      plugins: [{ id, pluginId, enabled: true }],
    },
  };
}

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

  it("requires explicit CSS track sizes at the Creator mutation boundary", () => {
    const numericRelativeSize = appUIOperationsSchema.safeParse([{
      type: "insert_layout_relative",
      anchorRef: "l1",
      direction: "left",
      node: labeledSlot("new") as Extract<AppUILayoutNode, { type: "slot" }>,
      size: 280,
    }]);
    expect(numericRelativeSize.success).toBe(false);

    const numericStringSizes = appUIOperationsSchema.safeParse([{
      type: "update_layout_node_props",
      nodeRef: "l0",
      set: { sizes: ["280", "1.5", ".5"] },
    }]);
    expect(numericStringSizes.success).toBe(false);

    const numericUpdatedTracks = appUIOperationsSchema.safeParse([{
      type: "update_layout_node_props",
      nodeRef: "l0",
      set: { sizes: [280, "minmax(0, 1fr)"] },
    }]);
    expect(numericUpdatedTracks.success).toBe(false);

    const explicitTracks = appUIOperationsSchema.safeParse([{
      type: "insert_layout_relative",
      anchorRef: "l1",
      direction: "left",
      node: labeledSlot("new") as Extract<AppUILayoutNode, { type: "slot" }>,
      size: "280px",
      anchorSize: "minmax(0, 1fr)",
    }]);
    expect(explicitTracks.success).toBe(true);

    const panelWidth = appUIOperationsSchema.safeParse([{
      type: "update_layout_node_props",
      nodeRef: "l0",
      set: { width: 280 },
    }]);
    expect(panelWidth.success).toBe(true);
  });

  it("accepts only instance-identity semantic Plugin move placements", () => {
    expect(appUIOperationsSchema.safeParse([{
      type: "move_plugin_to",
      instanceId: "button-main",
      placement: {
        type: "relative",
        anchorInstanceId: "conversation-main",
        relation: "after",
      },
    }]).success).toBe(true);
    expect(appUIOperationsSchema.safeParse([{
      type: "move_plugin_to",
      instanceId: "button-main",
      placement: {
        type: "plugin_slot",
        parentInstanceId: "composer-main",
        slot: "actions",
      },
    }]).success).toBe(true);
    expect(appUIOperationsSchema.safeParse([{
      type: "move_plugin_to",
      instanceId: "button-main",
      placement: {
        type: "relative",
        anchorInstanceId: "conversation-main",
        relation: "after",
        anchorPluginId: "legacy-anchor",
      },
    }]).success).toBe(false);
  });

  it("fails closed if update props bypasses operation parsing", () => {
    const invalidOperation = {
      type: "update_layout_node_props",
      nodeRef: "l0",
      set: { sizes: [280, "minmax(0, 1fr)"] },
    } as never;

    expect(() => applyAppUIOperations({
      root: {
        type: "row",
        sizes: ["1fr", "1fr"],
        children: [labeledSlot("A"), labeledSlot("B")],
      },
    }, [invalidOperation])).toThrowError(expect.objectContaining({
      code: "LAYOUT_TRACK_SIZE_UNIT_REQUIRED",
    }));
  });

  it("keeps legacy numeric persisted tracks compatible", () => {
    const result = applyAppUIOperations({
      root: {
        type: "row",
        sizes: [2, 1],
        children: [labeledSlot("A"), labeledSlot("B")],
      },
    }, [{
      type: "update_layout_node_props",
      nodeRef: "l0",
      set: { gap: 8 },
    }]);

    expect(result.root).toMatchObject({
      type: "row",
      sizes: [2, 1],
      gap: 8,
    });
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

  it("computes relative insertion indexes after detaching the target", () => {
    expect(relativeInsertionIndex(0, 2, "after")).toBe(2);
    expect(relativeInsertionIndex(2, 0, "after")).toBe(1);
    expect(relativeInsertionIndex(1, 2, "before")).toBe(1);
    expect(relativeInsertionIndex(1, 0, "after")).toBe(1);
  });

  it("moves an existing visual branch relative to an adjacent Row sibling", () => {
    const source: AppUIModel = {
      root: {
        type: "row",
        sizes: ["160px", "280px", "minmax(0, 1fr)"],
        children: [
          visualBranch("left-main", "left"),
          visualBranch("history-main", "history", {
            width: "280px",
            minWidth: 240,
            maxWidth: 360,
            resizable: true,
          }),
          visualBranch("conversation-main", "conversation", {
            height: "100%",
          }),
        ],
      },
    };

    const result = applyAppUIOperations(source, [{
      type: "move_plugin_to",
      instanceId: "history-main",
      placement: {
        type: "relative",
        anchorInstanceId: "conversation-main",
        relation: "after",
      },
    }]);

    expect(result.root).toMatchObject({
      type: "row",
      sizes: ["160px", "minmax(0, 1fr)", "280px"],
      children: [
        { type: "panel", child: { type: "slot", plugins: [{ id: "left-main" }] } },
        { type: "panel", child: { type: "slot", plugins: [{ id: "conversation-main" }] } },
        {
          type: "panel",
          width: "280px",
          minWidth: 240,
          maxWidth: 360,
          resizable: true,
          child: { type: "slot", plugins: [{ id: "history-main" }] },
        },
      ],
    });
    expect(planPluginMove(result, {
      type: "move_plugin_to",
      instanceId: "history-main",
      placement: {
        type: "relative",
        anchorInstanceId: "conversation-main",
        relation: "after",
      },
    }).changed).toBe(false);
  });

  it("returns an unchanged relative plan when the requested adjacency is already satisfied", () => {
    const source: AppUIModel = {
      root: {
        type: "row",
        sizes: ["1fr", "280px"],
        children: [
          visualBranch("conversation-main", "conversation"),
          visualBranch("history-main", "history"),
        ],
      },
    };
    const plan = planPluginMove(source, {
      type: "move_plugin_to",
      instanceId: "history-main",
      placement: {
        type: "relative",
        anchorInstanceId: "conversation-main",
        relation: "after",
      },
    });

    expect(plan).toMatchObject({
      type: "relative",
      changed: false,
      sourceIndex: 1,
      anchorIndex: 0,
    });
    expect(applyAppUIOperations(source, [{
      type: "move_plugin_to",
      instanceId: "history-main",
      placement: {
        type: "relative",
        anchorInstanceId: "conversation-main",
        relation: "after",
      },
    }])).toEqual(source);
  });

  it("moves the right visual branch before the left sibling", () => {
    const source: AppUIModel = {
      root: {
        type: "row",
        sizes: ["1fr", "280px"],
        children: [
          visualBranch("left-main", "left"),
          visualBranch("right-main", "right", { width: "280px" }),
        ],
      },
    };

    const result = applyAppUIOperations(source, [{
      type: "move_plugin_to",
      instanceId: "right-main",
      placement: {
        type: "relative",
        anchorInstanceId: "left-main",
        relation: "before",
      },
    }]);

    expect(result.root).toMatchObject({
      type: "row",
      sizes: ["280px", "1fr"],
      children: [
        { type: "panel", width: "280px", child: { type: "slot", plugins: [{ id: "right-main" }] } },
        { type: "panel", child: { type: "slot", plugins: [{ id: "left-main" }] } },
      ],
    });
  });

  it("rejects a relative move when the target occupies a shared Layout Slot", () => {
    const source: AppUIModel = {
      root: {
        type: "row",
        children: [
          {
            type: "slot",
            plugins: [
              { id: "target-main", pluginId: "target", enabled: true },
              { id: "other-main", pluginId: "other", enabled: true },
            ],
          },
          visualBranch("anchor-main", "anchor"),
        ],
      },
    };
    const before = structuredClone(source);

    expect(() => applyAppUIOperations(source, [{
      type: "move_plugin_to",
      instanceId: "target-main",
      placement: {
        type: "relative",
        anchorInstanceId: "anchor-main",
        relation: "after",
      },
    }])).toThrowError(expect.objectContaining({
      code: "AUTHORING_MOVE_UNSUPPORTED",
      details: expect.objectContaining({ reason: "shared-layout-slot", role: "target" }),
    }));
    expect(source).toEqual(before);
  });

  it("rejects a relative move when the anchor occupies a shared Layout Slot", () => {
    const source: AppUIModel = {
      root: {
        type: "row",
        children: [
          visualBranch("target-main", "target"),
          {
            type: "slot",
            plugins: [
              { id: "anchor-main", pluginId: "anchor", enabled: true },
              { id: "other-main", pluginId: "other", enabled: true },
            ],
          },
        ],
      },
    };
    const before = structuredClone(source);

    expect(() => applyAppUIOperations(source, [{
      type: "move_plugin_to",
      instanceId: "target-main",
      placement: {
        type: "relative",
        anchorInstanceId: "anchor-main",
        relation: "after",
      },
    }])).toThrowError(expect.objectContaining({
      code: "AUTHORING_MOVE_UNSUPPORTED",
      details: expect.objectContaining({ reason: "shared-layout-slot", role: "anchor" }),
    }));
    expect(source).toEqual(before);
  });

  it("rejects a relative move for a Plugin-local target", () => {
    const source: AppUIModel = {
      root: {
        type: "slot",
        plugins: [
          {
            id: "owner-main",
            pluginId: "toolbar",
            enabled: true,
            slots: {
              content: [{ id: "target-main", pluginId: "button", enabled: true }],
            },
          },
          { id: "anchor-main", pluginId: "badge", enabled: true },
        ],
      },
    };
    const before = structuredClone(source);

    expect(() => applyAppUIOperations(source, [{
      type: "move_plugin_to",
      instanceId: "target-main",
      placement: {
        type: "relative",
        anchorInstanceId: "anchor-main",
        relation: "after",
      },
    }])).toThrowError(expect.objectContaining({
      code: "AUTHORING_MOVE_UNSUPPORTED",
      details: expect.objectContaining({ reason: "plugin-local-slot", role: "target" }),
    }));
    expect(source).toEqual(before);
  });

  it("rejects relative moves whose visual parent is a Stack", () => {
    const source: AppUIModel = {
      root: {
        type: "stack",
        children: [visualBranch("target-main", "target"), visualBranch("anchor-main", "anchor")],
      },
    };

    expect(() => applyAppUIOperations(source, [{
      type: "move_plugin_to",
      instanceId: "target-main",
      placement: {
        type: "relative",
        anchorInstanceId: "anchor-main",
        relation: "after",
      },
    }])).toThrowError(expect.objectContaining({
      code: "AUTHORING_MOVE_UNSUPPORTED",
      details: expect.objectContaining({ reason: "stack", role: "target" }),
    }));
  });

  it("rejects relative moves whose visual parent is a Column", () => {
    const source: AppUIModel = {
      root: {
        type: "column",
        children: [visualBranch("target-main", "target"), visualBranch("anchor-main", "anchor")],
      },
    };

    expect(() => applyAppUIOperations(source, [{
      type: "move_plugin_to",
      instanceId: "target-main",
      placement: {
        type: "relative",
        anchorInstanceId: "anchor-main",
        relation: "after",
      },
    }])).toThrowError(expect.objectContaining({
      code: "AUTHORING_MOVE_UNSUPPORTED",
      details: expect.objectContaining({ reason: "column", role: "target" }),
    }));
  });

  it("rejects relative moves across different Row parents", () => {
    const source: AppUIModel = {
      root: {
        type: "row",
        children: [
          { type: "row", children: [visualBranch("target-main", "target")] },
          { type: "row", children: [visualBranch("anchor-main", "anchor")] },
        ],
      },
    };

    expect(() => applyAppUIOperations(source, [{
      type: "move_plugin_to",
      instanceId: "target-main",
      placement: {
        type: "relative",
        anchorInstanceId: "anchor-main",
        relation: "after",
      },
    }])).toThrowError(expect.objectContaining({
      code: "AUTHORING_MOVE_UNSUPPORTED",
      details: expect.objectContaining({ reason: "different-row" }),
    }));
  });

  it("moves a Plugin-local child into a declared Plugin Slot", () => {
    const source: AppUIModel = {
      root: {
        type: "slot",
        plugins: [
          {
            id: "toolbar-main",
            pluginId: "toolbar",
            enabled: true,
            slots: {
              actions: [{ id: "button-main", pluginId: "button", enabled: true }],
            },
          },
          {
            id: "composer-main",
            pluginId: "composer",
            enabled: true,
            slots: { actions: [] },
          },
        ],
      },
    };
    const result = applyAppUIOperations(source, [{
      type: "move_plugin_to",
      instanceId: "button-main",
      placement: {
        type: "plugin_slot",
        parentInstanceId: "composer-main",
        slot: "actions",
      },
    }], {
      pluginMoveContracts: pluginMoveContracts({
        composer: {
          actions: {
            description: "Composer actions",
            cardinality: "many",
            optional: true,
            accepts: { anyOfCapabilities: ["composer-action"] },
          },
        },
      }),
    });

    expect(result.root).toMatchObject({
      type: "slot",
      plugins: [
        { id: "toolbar-main", slots: { actions: [] } },
        { id: "composer-main", slots: { actions: [{ id: "button-main" }] } },
      ],
    });
  });

  it("moves from a shared Layout Slot without collapsing the remaining region", () => {
    const source: AppUIModel = {
      root: {
        type: "row",
        children: [
          {
            type: "slot",
            plugins: [
              { id: "button-main", pluginId: "button", enabled: true },
              { id: "badge-main", pluginId: "badge", enabled: true },
            ],
          },
          {
            type: "slot",
            plugins: [{
              id: "composer-main",
              pluginId: "composer",
              enabled: true,
              slots: { actions: [] },
            }],
          },
        ],
      },
    };
    const result = applyAppUIOperations(source, [{
      type: "move_plugin_to",
      instanceId: "button-main",
      placement: {
        type: "plugin_slot",
        parentInstanceId: "composer-main",
        slot: "actions",
      },
    }], {
      pluginMoveContracts: pluginMoveContracts({
        composer: {
          actions: {
            description: "Composer actions",
            cardinality: "many",
            optional: true,
            accepts: { anyOfCapabilities: ["composer-action"] },
          },
        },
      }),
    });

    expect(result.root).toMatchObject({
      type: "row",
      children: [
        { type: "slot", plugins: [{ id: "badge-main" }] },
        { type: "slot", plugins: [{ id: "composer-main", slots: { actions: [{ id: "button-main" }] } }] },
      ],
    });
  });

  it("moves from a dedicated Layout region and reuses source collapse semantics", () => {
    const source: AppUIModel = {
      root: {
        type: "row",
        sizes: ["280px", "1fr"],
        children: [
          {
            type: "panel",
            width: "280px",
            resizable: true,
            child: {
              type: "slot",
              plugins: [{ id: "button-main", pluginId: "button", enabled: true }],
            },
          },
          {
            type: "panel",
            child: {
              type: "slot",
              plugins: [{
                id: "composer-main",
                pluginId: "composer",
                enabled: true,
                slots: { actions: [] },
              }],
            },
          },
        ],
      },
    };
    const result = applyAppUIOperations(source, [{
      type: "move_plugin_to",
      instanceId: "button-main",
      placement: {
        type: "plugin_slot",
        parentInstanceId: "composer-main",
        slot: "actions",
      },
    }], {
      pluginMoveContracts: pluginMoveContracts({
        composer: {
          actions: {
            description: "Composer actions",
            cardinality: "many",
            optional: true,
            accepts: { anyOfCapabilities: ["composer-action"] },
          },
        },
      }),
    });

    expect(result.root).toEqual({
      type: "panel",
      child: {
        type: "slot",
        plugins: [{
          id: "composer-main",
          pluginId: "composer",
          enabled: true,
          slots: {
            actions: [{ id: "button-main", pluginId: "button", enabled: true }],
          },
        }],
      },
    });
  });

  it("rejects incompatible Plugin Slot moves before any source cleanup", () => {
    const source: AppUIModel = {
      root: {
        type: "row",
        sizes: ["280px", "1fr"],
        children: [
          { type: "slot", plugins: [{ id: "button-main", pluginId: "button", enabled: true }] },
          {
            type: "slot",
            plugins: [{
              id: "composer-main",
              pluginId: "composer",
              enabled: true,
              slots: { actions: [] },
            }],
          },
        ],
      },
    };

    expect(() => applyAppUIOperations(source, [{
      type: "move_plugin_to",
      instanceId: "button-main",
      placement: {
        type: "plugin_slot",
        parentInstanceId: "composer-main",
        slot: "actions",
      },
    }], {
      pluginMoveContracts: pluginMoveContracts({
        composer: {
          actions: {
            description: "Composer actions",
            cardinality: "many",
            optional: true,
            accepts: { anyOfCapabilities: ["other"] },
          },
        },
      }),
    })).toThrowError(expect.objectContaining({
      code: "AUTHORING_MOVE_INCOMPATIBLE",
    }));
    expect(source.root).toMatchObject({
      type: "row",
      children: [
        { type: "slot", plugins: [{ id: "button-main" }] },
        { type: "slot", plugins: [{ id: "composer-main", slots: { actions: [] } }] },
      ],
    });
  });

  it("rejects an Application Plugin source from a Plugin Slot move", () => {
    const source: AppUIModel = {
      applicationPlugins: [{ id: "application-main", pluginId: "button", enabled: true }],
      root: {
        type: "slot",
        plugins: [{
          id: "composer-main",
          pluginId: "composer",
          enabled: true,
          slots: { actions: [] },
        }],
      },
    };
    const before = structuredClone(source);

    expect(() => applyAppUIOperations(source, [{
      type: "move_plugin_to",
      instanceId: "application-main",
      placement: {
        type: "plugin_slot",
        parentInstanceId: "composer-main",
        slot: "actions",
      },
    }], {
      pluginMoveContracts: pluginMoveContracts({
        composer: {
          actions: {
            description: "Composer actions",
            cardinality: "many",
            optional: true,
            accepts: { anyOfCapabilities: ["composer-action"] },
          },
        },
      }),
    })).toThrowError(expect.objectContaining({
      code: "AUTHORING_MOVE_UNSUPPORTED",
      details: expect.objectContaining({ reason: "application-plugin-source" }),
    }));
    expect(source).toEqual(before);
  });

  it("rejects a Plugin Slot move when accepts is not declared", () => {
    const source: AppUIModel = {
      root: {
        type: "slot",
        plugins: [
          { id: "button-main", pluginId: "button", enabled: true },
          {
            id: "composer-main",
            pluginId: "composer",
            enabled: true,
            slots: { actions: [] },
          },
        ],
      },
    };
    const before = structuredClone(source);

    expect(() => applyAppUIOperations(source, [{
      type: "move_plugin_to",
      instanceId: "button-main",
      placement: {
        type: "plugin_slot",
        parentInstanceId: "composer-main",
        slot: "actions",
      },
    }], {
      pluginMoveContracts: pluginMoveContracts({
        composer: {
          actions: {
            description: "Composer actions",
            cardinality: "many",
            optional: true,
          },
        },
      }),
    })).toThrowError(expect.objectContaining({
      code: "AUTHORING_MOVE_UNSUPPORTED",
      details: expect.objectContaining({ reason: "slot-accepts-not-declared" }),
    }));
    expect(source).toEqual(before);
  });

  it("rejects an occupied cardinality-one Plugin Slot", () => {
    const source: AppUIModel = {
      root: {
        type: "slot",
        plugins: [
          { id: "button-main", pluginId: "button", enabled: true },
          {
            id: "composer-main",
            pluginId: "composer",
            enabled: true,
            slots: {
              actions: [{ id: "badge-main", pluginId: "badge", enabled: true }],
            },
          },
        ],
      },
    };
    const before = structuredClone(source);

    expect(() => applyAppUIOperations(source, [{
      type: "move_plugin_to",
      instanceId: "button-main",
      placement: {
        type: "plugin_slot",
        parentInstanceId: "composer-main",
        slot: "actions",
      },
    }], {
      pluginMoveContracts: pluginMoveContracts({
        composer: {
          actions: {
            description: "Composer actions",
            cardinality: "one",
            optional: true,
            accepts: { anyOfCapabilities: ["composer-action"] },
          },
        },
      }),
    })).toThrowError(expect.objectContaining({
      code: "AUTHORING_MOVE_INCOMPATIBLE",
      details: expect.objectContaining({ reason: "slot-cardinality-full" }),
    }));
    expect(source).toEqual(before);
  });

  it("keeps an already-satisfied Plugin Slot move unchanged", () => {
    const source: AppUIModel = {
      root: {
        type: "slot",
        plugins: [{
          id: "composer-main",
          pluginId: "composer",
          enabled: true,
          slots: {
            actions: [{ id: "button-main", pluginId: "button", enabled: true }],
          },
        }],
      },
    };
    const operation = {
      type: "move_plugin_to" as const,
      instanceId: "button-main",
      placement: {
        type: "plugin_slot" as const,
        parentInstanceId: "composer-main",
        slot: "actions",
      },
    };
    const contracts = pluginMoveContracts({
      composer: {
        actions: {
          description: "Composer actions",
          cardinality: "one",
          optional: true,
          accepts: { anyOfCapabilities: ["composer-action"] },
        },
      },
    });

    expect(planPluginMove(source, operation, contracts)).toMatchObject({
      type: "plugin_slot",
      changed: false,
      source: "plugin_slot",
    });
    expect(applyAppUIOperations(source, [operation], { pluginMoveContracts: contracts }))
      .toEqual(source);
  });

  it("rejects a Plugin Slot move whose target is its own parent", () => {
    const source: AppUIModel = {
      root: {
        type: "slot",
        plugins: [{
          id: "parent-main",
          pluginId: "toolbar",
          enabled: true,
          slots: { content: [] },
        }],
      },
    };

    expect(() => applyAppUIOperations(source, [{
      type: "move_plugin_to",
      instanceId: "parent-main",
      placement: {
        type: "plugin_slot",
        parentInstanceId: "parent-main",
        slot: "content",
      },
    }], {
      pluginMoveContracts: pluginMoveContracts({
        toolbar: {
          content: {
            description: "Toolbar content",
            cardinality: "many",
            optional: true,
            accepts: { anyOfCapabilities: ["toolbar"] },
          },
        },
      }),
    })).toThrowError(expect.objectContaining({
      code: "AUTHORING_MOVE_INCOMPATIBLE",
      details: expect.objectContaining({ reason: "cycle" }),
    }));
  });

  it("rejects a Plugin Slot move into a descendant parent", () => {
    const source: AppUIModel = {
      root: {
        type: "slot",
        plugins: [{
          id: "parent-main",
          pluginId: "toolbar",
          enabled: true,
          slots: {
            content: [{ id: "child-main", pluginId: "button", enabled: true }],
          },
        }],
      },
    };

    expect(() => applyAppUIOperations(source, [{
      type: "move_plugin_to",
      instanceId: "parent-main",
      placement: {
        type: "plugin_slot",
        parentInstanceId: "child-main",
        slot: "content",
      },
    }], {
      pluginMoveContracts: pluginMoveContracts({
        button: {
          content: {
            description: "Button content",
            cardinality: "many",
            optional: true,
            accepts: { anyOfCapabilities: ["toolbar"] },
          },
        },
      }),
    })).toThrowError(expect.objectContaining({
      code: "AUTHORING_MOVE_INCOMPATIBLE",
      details: expect.objectContaining({ reason: "cycle" }),
    }));
  });

  it("rejects a Plugin Slot move with an unsafe dedicated source region", () => {
    const source: AppUIModel = {
      root: {
        type: "stack",
        children: [
          { type: "slot", plugins: [{ id: "button-main", pluginId: "button", enabled: true }] },
          {
            type: "slot",
            plugins: [{
              id: "composer-main",
              pluginId: "composer",
              enabled: true,
              slots: { actions: [] },
            }],
          },
        ],
      },
    };
    const before = structuredClone(source);

    expect(() => applyAppUIOperations(source, [{
      type: "move_plugin_to",
      instanceId: "button-main",
      placement: {
        type: "plugin_slot",
        parentInstanceId: "composer-main",
        slot: "actions",
      },
    }], {
      pluginMoveContracts: pluginMoveContracts({
        composer: {
          actions: {
            description: "Composer actions",
            cardinality: "many",
            optional: true,
            accepts: { anyOfCapabilities: ["composer-action"] },
          },
        },
      }),
    })).toThrowError(expect.objectContaining({
      code: "AUTHORING_MOVE_UNSUPPORTED",
      details: expect.objectContaining({ reason: "dedicated-source-cannot-collapse" }),
    }));
    expect(source).toEqual(before);
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

  it("uses default removal to collapse a safe dedicated region", () => {
    const source: AppUIModel = {
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
    };

    expect(resolveDefaultPluginRemovalReflow(source, "history-main")).toBe(
      "collapsed-dedicated-region",
    );
    const result = applyAppUIOperations(source, [{
      type: "remove_plugin_default",
      instanceId: "history-main",
    }]);

    expect(result.root).toEqual({
      type: "slot",
      plugins: [{ id: "surface-main", pluginId: "surface", enabled: true }],
    });
  });

  it("preserves shared and Plugin-local containers for default removal", () => {
    const shared: AppUIModel = {
      root: {
        type: "row",
        children: [{
          type: "slot",
          plugins: [
            { id: "history-main", pluginId: "history", enabled: true },
            { id: "secondary-main", pluginId: "secondary", enabled: true },
          ],
        }],
      },
    };
    expect(resolveDefaultPluginRemovalReflow(shared, "history-main")).toBe(
      "preserved-container",
    );
    const sharedResult = applyAppUIOperations(shared, [{
      type: "remove_plugin_default",
      instanceId: "history-main",
    }]);
    expect(sharedResult.root).toMatchObject({
      type: "row",
      children: [{
        type: "slot",
        plugins: [{ id: "secondary-main" }],
      }],
    });

    const stacked: AppUIModel = {
      root: {
        type: "stack",
        children: [
          { type: "slot", plugins: [{ id: "history-main", pluginId: "history", enabled: true }] },
          { type: "slot", plugins: [{ id: "surface-main", pluginId: "surface", enabled: true }] },
        ],
      },
    };
    expect(resolveDefaultPluginRemovalReflow(stacked, "history-main")).toBe(
      "preserved-container",
    );
    expect(applyAppUIOperations(stacked, [{
      type: "remove_plugin_default",
      instanceId: "history-main",
    }]).root).toMatchObject({
      type: "stack",
      children: [
        { type: "slot", plugins: [] },
        { type: "slot", plugins: [{ id: "surface-main" }] },
      ],
    });

    const nested: AppUIModel = {
      root: {
        type: "stack",
        children: [{
          type: "slot",
          plugins: [{
            id: "surface-main",
            pluginId: "surface",
            enabled: true,
            slots: {
              content: [{ id: "history-main", pluginId: "history", enabled: true }],
            },
          }],
        }],
      },
    };
    expect(resolveDefaultPluginRemovalReflow(nested, "history-main")).toBe(
      "preserved-container",
    );
    const nestedResult = applyAppUIOperations(nested, [{
      type: "remove_plugin_default",
      instanceId: "history-main",
    }]);
    expect(nestedResult.root).toMatchObject({
      type: "stack",
      children: [{
        type: "slot",
        plugins: [{ id: "surface-main", slots: { content: [] } }],
      }],
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
