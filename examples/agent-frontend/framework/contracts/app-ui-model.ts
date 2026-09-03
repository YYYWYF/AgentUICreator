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

/** A physical Layout outlet. Runtime contributions belong to SlotRegistry. */
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

export interface PluginInstance {
  id: string;
  pluginId: string;
  enabled: boolean;
  mount?: { slotId: string; order?: number | undefined } | undefined;
  props?: Record<string, unknown> | undefined;
}

export interface AppUIModel {
  version: typeof APP_UI_MODEL_VERSION;
  root: LayoutNode;
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

export const pluginInstanceSchema: z.ZodType<PluginInstance> = z.strictObject({
  id: nonBlankStringSchema,
  pluginId: nonBlankStringSchema,
  enabled: z.boolean(),
  mount: z.strictObject({
    slotId: nonBlankStringSchema,
    order: z.number().finite().optional(),
  }).optional(),
  props: z.record(z.string(), z.unknown()).optional(),
});

const appUIModelShapeSchema: z.ZodType<AppUIModel> = z.strictObject({
  version: z.literal(APP_UI_MODEL_VERSION),
  root: layoutNodeSchema,
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

export const appUIModelSchema = appUIModelShapeSchema.superRefine(
  (model, context) => {
    const nodeIds = new Set<string>();
    const layoutSlotNodes = new Map<string, SlotNode>();

    for (const [instanceKey, instance] of Object.entries(model.pluginInstances)) {
      if (instanceKey !== instance.id) {
        addIssue(
          context,
          ["pluginInstances", instanceKey, "id"],
          `Plugin instance key "${instanceKey}" must match id "${instance.id}"`,
        );
      }
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
    };

    visitNode(model.root, ["root"]);
  },
);

export function parseAppUIModel(input: unknown): AppUIModel {
  return appUIModelSchema.parse(input);
}

export function parseAppUIModelJson(source: string): AppUIModel {
  return parseAppUIModel(JSON.parse(source));
}
