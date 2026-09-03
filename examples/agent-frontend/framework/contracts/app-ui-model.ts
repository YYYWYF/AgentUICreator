import { z } from "zod";

export const APP_UI_MODEL_VERSION = "2" as const;

export type LayoutSize = number | string;

export interface RowNode {
  type: "row";
  id: string;
  children: LayoutNode[];
  gap?: number | undefined;
  sizes?: LayoutSize[] | undefined;
}

export interface ColumnNode {
  type: "column";
  id: string;
  children: LayoutNode[];
  gap?: number | undefined;
  sizes?: LayoutSize[] | undefined;
}

export interface StackNode {
  type: "stack";
  id: string;
  children: LayoutNode[];
  active?: string | undefined;
}

export interface PanelNode {
  type: "panel";
  id: string;
  child: LayoutNode;
  width?: LayoutSize | undefined;
  height?: LayoutSize | undefined;
  minWidth?: number | undefined;
  maxWidth?: number | undefined;
  resizable?: boolean | undefined;
}

/** A physical Layout outlet. Composition and Slot semantics live in AppUIModel.slots. */
export interface SlotNode {
  type: "slot";
  id: string;
  slotId: string;
}

export type LayoutNode =
  | RowNode
  | ColumnNode
  | StackNode
  | PanelNode
  | SlotNode;

export type UISlotKind = "single" | "list" | "keyed" | "chain";
export type UISlotScope = "root" | "thread-maybe" | "thread";

export type UISlotOwner =
  | {
      type: "layout";
      nodeId: string;
    }
  | {
      type: "plugin-instance";
      instanceId: string;
      outlet: string;
    };

/** Model-facing documentation for one value supplied by the Slot owner. */
export interface UISlotOwnerPropContract {
  name: string;
  type: string;
  description: string;
  required: boolean;
}

/** One configured occupant. Kind-specific identity is validated by appUIModelSchema. */
export interface UISlotOccupant {
  instanceId: string;
  id?: string | undefined;
  key?: string | undefined;
  order?: number | undefined;
}

/** A semantic UI extension point, separate from its physical Layout outlet. */
export interface UISlot {
  id: string;
  kind: UISlotKind;
  scope: UISlotScope;
  description: string;
  owner: UISlotOwner;
  ownerProps?: UISlotOwnerPropContract[] | undefined;
  fallback?: "none" | "owner" | undefined;
  occupants: UISlotOccupant[];
}

export interface PluginInstance {
  id: string;
  pluginId: string;
  enabled: boolean;
  props?: Record<string, unknown> | undefined;
}

export interface AppUIModel {
  version: typeof APP_UI_MODEL_VERSION;
  root: LayoutNode;
  slots: Record<string, UISlot>;
  pluginInstances: Record<string, PluginInstance>;
  settings?:
    | {
        theme?: string | undefined;
      }
    | undefined;
}

const nonBlankStringSchema = z
  .string()
  .refine((value) => value.trim().length > 0, "Must not be blank");

const nonNegativeNumberSchema = z.number().nonnegative();

export const layoutSizeSchema: z.ZodType<LayoutSize> = z.union([
  nonNegativeNumberSchema,
  nonBlankStringSchema,
]);

export const layoutNodeSchema: z.ZodType<LayoutNode> = z.lazy(() =>
  z.union([
    rowNodeSchema,
    columnNodeSchema,
    stackNodeSchema,
    panelNodeSchema,
    slotNodeSchema,
  ]),
);

export const rowNodeSchema: z.ZodType<RowNode> = z.strictObject({
  type: z.literal("row"),
  id: nonBlankStringSchema,
  children: z.array(layoutNodeSchema),
  gap: nonNegativeNumberSchema.optional(),
  sizes: z.array(layoutSizeSchema).optional(),
});

export const columnNodeSchema: z.ZodType<ColumnNode> = z.strictObject({
  type: z.literal("column"),
  id: nonBlankStringSchema,
  children: z.array(layoutNodeSchema),
  gap: nonNegativeNumberSchema.optional(),
  sizes: z.array(layoutSizeSchema).optional(),
});

export const stackNodeSchema: z.ZodType<StackNode> = z.strictObject({
  type: z.literal("stack"),
  id: nonBlankStringSchema,
  children: z.array(layoutNodeSchema),
  active: nonBlankStringSchema.optional(),
});

export const panelNodeSchema: z.ZodType<PanelNode> = z.strictObject({
  type: z.literal("panel"),
  id: nonBlankStringSchema,
  child: layoutNodeSchema,
  width: layoutSizeSchema.optional(),
  height: layoutSizeSchema.optional(),
  minWidth: nonNegativeNumberSchema.optional(),
  maxWidth: nonNegativeNumberSchema.optional(),
  resizable: z.boolean().optional(),
});

export const slotNodeSchema: z.ZodType<SlotNode> = z.strictObject({
  type: z.literal("slot"),
  id: nonBlankStringSchema,
  slotId: nonBlankStringSchema,
});

export const slotOwnerSchema: z.ZodType<UISlotOwner> = z.discriminatedUnion(
  "type",
  [
    z.strictObject({
      type: z.literal("layout"),
      nodeId: nonBlankStringSchema,
    }),
    z.strictObject({
      type: z.literal("plugin-instance"),
      instanceId: nonBlankStringSchema,
      outlet: nonBlankStringSchema,
    }),
  ],
);

export const slotOccupantSchema: z.ZodType<UISlotOccupant> = z.strictObject({
  instanceId: nonBlankStringSchema,
  id: nonBlankStringSchema.optional(),
  key: nonBlankStringSchema.optional(),
  order: z.number().finite().optional(),
});

export const uiSlotSchema: z.ZodType<UISlot> = z.strictObject({
  id: nonBlankStringSchema,
  kind: z.enum(["single", "list", "keyed", "chain"]),
  scope: z.enum(["root", "thread-maybe", "thread"]),
  description: nonBlankStringSchema,
  owner: slotOwnerSchema,
  ownerProps: z
    .array(
      z.strictObject({
        name: nonBlankStringSchema,
        type: nonBlankStringSchema,
        description: nonBlankStringSchema,
        required: z.boolean(),
      }),
    )
    .optional(),
  fallback: z.enum(["none", "owner"]).optional(),
  occupants: z.array(slotOccupantSchema),
});

export const pluginInstanceSchema: z.ZodType<PluginInstance> = z.strictObject({
  id: nonBlankStringSchema,
  pluginId: nonBlankStringSchema,
  enabled: z.boolean(),
  props: z.record(z.string(), z.unknown()).optional(),
});

const appUIModelShapeSchema: z.ZodType<AppUIModel> = z.strictObject({
  version: z.literal(APP_UI_MODEL_VERSION),
  root: layoutNodeSchema,
  slots: z.record(z.string(), uiSlotSchema),
  pluginInstances: z.record(z.string(), pluginInstanceSchema),
  settings: z
    .strictObject({
      theme: nonBlankStringSchema.optional(),
    })
    .optional(),
});

type IssuePath = PropertyKey[];

function addIssue(
  context: z.RefinementCtx<AppUIModel>,
  path: IssuePath,
  message: string,
): void {
  context.addIssue({ code: "custom", path, message, input: undefined });
}

function validateOccupants(
  slot: UISlot,
  context: z.RefinementCtx<AppUIModel>,
  path: IssuePath,
): void {
  if (slot.kind === "single" && slot.occupants.length > 1) {
    addIssue(context, [...path, "occupants"], "single Slot accepts at most one occupant");
  }

  const cells = new Set<string>();
  slot.occupants.forEach((occupant, index) => {
    const occupantPath = [...path, "occupants", index];
    if (slot.kind === "list") {
      if (occupant.id === undefined) {
        addIssue(context, occupantPath, "list Slot occupant requires id");
      } else if (cells.has(occupant.id)) {
        addIssue(context, [...occupantPath, "id"], `Duplicate list occupant id "${occupant.id}"`);
      } else {
        cells.add(occupant.id);
      }
      if (occupant.key !== undefined) {
        addIssue(context, [...occupantPath, "key"], "list Slot occupant must not define key");
      }
      return;
    }

    if (slot.kind === "keyed") {
      if (occupant.key === undefined) {
        addIssue(context, occupantPath, "keyed Slot occupant requires key");
      } else if (cells.has(occupant.key)) {
        addIssue(context, [...occupantPath, "key"], `Duplicate keyed occupant key "${occupant.key}"`);
      } else {
        cells.add(occupant.key);
      }
      if (occupant.id !== undefined) {
        addIssue(context, [...occupantPath, "id"], "keyed Slot occupant must not define id");
      }
      if (occupant.order !== undefined) {
        addIssue(context, [...occupantPath, "order"], "keyed Slot occupant must not define order");
      }
      return;
    }

    if (occupant.id !== undefined || occupant.key !== undefined) {
      addIssue(context, occupantPath, `${slot.kind} Slot occupant must not define id or key`);
    }
    if (slot.kind === "single" && occupant.order !== undefined) {
      addIssue(context, [...occupantPath, "order"], "single Slot occupant must not define order");
    }
  });
}

export const appUIModelSchema = appUIModelShapeSchema.superRefine(
  (model, context) => {
    const nodeIds = new Set<string>();
    const layoutSlotNodes = new Map<string, SlotNode>();
    const mountedByInstance = new Map<string, string>();

    for (const [instanceKey, instance] of Object.entries(model.pluginInstances)) {
      if (instanceKey !== instance.id) {
        addIssue(
          context,
          ["pluginInstances", instanceKey, "id"],
          `Plugin instance key "${instanceKey}" must match id "${instance.id}"`,
        );
      }
    }

    for (const [slotKey, slot] of Object.entries(model.slots)) {
      if (slotKey !== slot.id) {
        addIssue(context, ["slots", slotKey, "id"], `Slot key "${slotKey}" must match id "${slot.id}"`);
      }
      validateOccupants(slot, context, ["slots", slotKey]);
      const ownerPropNames = new Set<string>();
      (slot.ownerProps ?? []).forEach((ownerProp, index) => {
        if (ownerPropNames.has(ownerProp.name)) {
          addIssue(
            context,
            ["slots", slotKey, "ownerProps", index, "name"],
            `Duplicate owner prop "${ownerProp.name}"`,
          );
        }
        ownerPropNames.add(ownerProp.name);
      });
      slot.occupants.forEach((occupant, index) => {
        if (model.pluginInstances[occupant.instanceId] === undefined) {
          addIssue(
            context,
            ["slots", slotKey, "occupants", index, "instanceId"],
            `Plugin instance "${occupant.instanceId}" does not exist`,
          );
        }
        const previous = mountedByInstance.get(occupant.instanceId);
        if (previous !== undefined) {
          addIssue(
            context,
            ["slots", slotKey, "occupants", index, "instanceId"],
            `Plugin instance "${occupant.instanceId}" is already mounted in Slot "${previous}"`,
          );
        } else {
          mountedByInstance.set(occupant.instanceId, slot.id);
        }
      });
    }

    const visitNode = (node: LayoutNode, path: IssuePath): void => {
      if (nodeIds.has(node.id)) {
        addIssue(context, [...path, "id"], `Duplicate layout node id "${node.id}"`);
      } else {
        nodeIds.add(node.id);
      }

      if (node.type === "row" || node.type === "column") {
        if (node.sizes !== undefined && node.sizes.length !== node.children.length) {
          addIssue(context, [...path, "sizes"], "sizes must contain exactly one entry for each child");
        }
        node.children.forEach((child, index) => visitNode(child, [...path, "children", index]));
        return;
      }
      if (node.type === "stack") {
        if (node.active !== undefined && !node.children.some((child) => child.id === node.active)) {
          addIssue(context, [...path, "active"], `Stack active id "${node.active}" must reference a direct child`);
        }
        node.children.forEach((child, index) => visitNode(child, [...path, "children", index]));
        return;
      }
      if (node.type === "panel") {
        if (node.minWidth !== undefined && node.maxWidth !== undefined && node.minWidth > node.maxWidth) {
          addIssue(context, [...path, "minWidth"], "minWidth must not be greater than maxWidth");
        }
        visitNode(node.child, [...path, "child"]);
        return;
      }
      if (layoutSlotNodes.has(node.slotId)) {
        addIssue(context, [...path, "slotId"], `Layout Slot "${node.slotId}" is rendered by more than one node`);
      } else {
        layoutSlotNodes.set(node.slotId, node);
      }
      const slot = model.slots[node.slotId];
      if (slot === undefined) {
        addIssue(context, [...path, "slotId"], `Slot "${node.slotId}" does not exist`);
      } else if (slot.owner.type !== "layout" || slot.owner.nodeId !== node.id) {
        addIssue(
          context,
          ["slots", node.slotId, "owner"],
          `Layout Slot "${node.slotId}" must be owned by node "${node.id}"`,
        );
      }
    };

    visitNode(model.root, ["root"]);

    const childSlotsByOwner = new Map<string, string[]>();
    for (const [slotId, slot] of Object.entries(model.slots)) {
      if (slot.owner.type === "layout") {
        if ((slot.ownerProps?.length ?? 0) > 0) {
          addIssue(
            context,
            ["slots", slotId, "ownerProps"],
            "Layout-owned Slot must not declare owner props",
          );
        }
        if (slot.fallback === "owner") {
          addIssue(
            context,
            ["slots", slotId, "fallback"],
            "Layout-owned Slot cannot use owner fallback",
          );
        }
        const node = layoutSlotNodes.get(slotId);
        if (node === undefined || node.id !== slot.owner.nodeId) {
          addIssue(
            context,
            ["slots", slotId, "owner"],
            `Layout-owned Slot "${slotId}" has no matching Layout Slot node`,
          );
        }
        continue;
      }
      if (model.pluginInstances[slot.owner.instanceId] === undefined) {
        addIssue(
          context,
          ["slots", slotId, "owner", "instanceId"],
          `Slot owner PluginInstance "${slot.owner.instanceId}" does not exist`,
        );
      }
      const parentSlotId = mountedByInstance.get(slot.owner.instanceId);
      if (parentSlotId === undefined) {
        addIssue(
          context,
          ["slots", slotId, "owner", "instanceId"],
          `Slot owner PluginInstance "${slot.owner.instanceId}" is not mounted`,
        );
        continue;
      }
      const parentScope = model.slots[parentSlotId]?.scope;
      const scopeRank: Record<UISlotScope, number> = {
        root: 0,
        "thread-maybe": 1,
        thread: 2,
      };
      if (
        parentScope !== undefined &&
        scopeRank[slot.scope] < scopeRank[parentScope]
      ) {
        addIssue(
          context,
          ["slots", slotId, "scope"],
          `Child Slot scope "${slot.scope}" cannot outlive parent Slot scope "${parentScope}"`,
        );
      }
      const owner = slot.owner;
      const siblings = childSlotsByOwner.get(owner.instanceId) ?? [];
      if (siblings.some((siblingId) => {
        const siblingOwner = model.slots[siblingId]?.owner;
        return siblingOwner?.type === "plugin-instance" && siblingOwner.outlet === owner.outlet;
      })) {
        addIssue(
          context,
          ["slots", slotId, "owner", "outlet"],
          `PluginInstance "${owner.instanceId}" owns more than one Slot for outlet "${owner.outlet}"`,
        );
      }
      siblings.push(slotId);
      childSlotsByOwner.set(owner.instanceId, siblings);
    }

    const reachable = new Set<string>();
    const visitSlot = (slotId: string, ancestry: Set<string>): void => {
      if (ancestry.has(slotId)) {
        addIssue(context, ["slots", slotId, "owner"], `Slot ownership cycle reaches "${slotId}"`);
        return;
      }
      if (reachable.has(slotId)) return;
      reachable.add(slotId);
      const slot = model.slots[slotId];
      if (slot === undefined) return;
      const nextAncestry = new Set(ancestry);
      nextAncestry.add(slotId);
      slot.occupants.forEach((occupant) => {
        for (const childSlotId of childSlotsByOwner.get(occupant.instanceId) ?? []) {
          visitSlot(childSlotId, nextAncestry);
        }
      });
    };
    for (const slotId of layoutSlotNodes.keys()) visitSlot(slotId, new Set());
    for (const slotId of Object.keys(model.slots)) {
      if (!reachable.has(slotId)) {
        addIssue(context, ["slots", slotId, "owner"], `Slot "${slotId}" is unreachable from the Layout root`);
      }
    }
  },
);

export function parseAppUIModel(input: unknown): AppUIModel {
  return appUIModelSchema.parse(input);
}

export function parseAppUIModelJson(source: string): AppUIModel {
  return parseAppUIModel(JSON.parse(source));
}

/** Enabled visual instances reachable through enabled owners from Layout roots. */
export function collectReachablePluginInstanceIds(
  model: AppUIModel,
): ReadonlySet<string> {
  const result = new Set<string>();
  const childSlots = new Map<string, string[]>();
  for (const slot of Object.values(model.slots)) {
    if (slot.owner.type !== "plugin-instance") continue;
    const owned = childSlots.get(slot.owner.instanceId) ?? [];
    owned.push(slot.id);
    childSlots.set(slot.owner.instanceId, owned);
  }
  const visitedSlots = new Set<string>();
  const visitSlot = (slotId: string): void => {
    if (visitedSlots.has(slotId)) return;
    visitedSlots.add(slotId);
    const slot = model.slots[slotId];
    if (slot === undefined) return;
    for (const occupant of slot.occupants) {
      const instance = model.pluginInstances[occupant.instanceId];
      if (instance?.enabled !== true) continue;
      result.add(instance.id);
      for (const childSlotId of childSlots.get(instance.id) ?? []) {
        visitSlot(childSlotId);
      }
    }
  };
  for (const slot of Object.values(model.slots)) {
    if (slot.owner.type === "layout") visitSlot(slot.id);
  }
  return result;
}
