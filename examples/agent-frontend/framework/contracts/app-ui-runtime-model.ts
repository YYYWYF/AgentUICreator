import type { LayoutNode, LayoutTrackSize, PanelDimension } from "@agent-ui/runtime-react";
import { z } from "zod";
import { isGridTrackOnlyDimension } from "./panel-dimension";

export type {
  ColumnNode as RuntimeColumnNode,
  LayoutNode as RuntimeLayoutNode,
  LayoutTrackSize,
  PanelDimension,
  PanelNode as RuntimePanelNode,
  RowNode as RuntimeRowNode,
  SlotNode as RuntimeSlotNode,
  StackNode as RuntimeStackNode,
} from "@agent-ui/runtime-react";

export interface AppUIRuntimePluginInstance {
  id: string;
  pluginId: string;
  enabled: boolean;
  mount?: { slotId: string; order?: number | undefined } | undefined;
  props?: Record<string, unknown> | undefined;
}

export interface AppUIRuntimeModel {
  root: LayoutNode;
  pluginInstances: Record<string, AppUIRuntimePluginInstance>;
  settings?: { theme?: string | undefined } | undefined;
}

const nonBlankStringSchema = z.string().refine(
  (value) => value.trim().length > 0,
  "Must not be blank",
);
const nonNegativeNumberSchema = z.number().nonnegative();

export const runtimeLayoutTrackSizeSchema: z.ZodType<LayoutTrackSize> = z.union([
  nonNegativeNumberSchema,
  nonBlankStringSchema,
]);

export const runtimePanelDimensionSchema: z.ZodType<PanelDimension> = z.union([
  nonNegativeNumberSchema,
  nonBlankStringSchema.refine(
    (value) => !isGridTrackOnlyDimension(value),
    "Panel width/height must be a CSS element dimension, not Grid track syntax",
  ),
]);

export const runtimeLayoutNodeSchema: z.ZodType<LayoutNode> = z.lazy(() =>
  z.union([
    z.strictObject({
      type: z.literal("row"), id: nonBlankStringSchema,
      children: z.array(runtimeLayoutNodeSchema),
      gap: nonNegativeNumberSchema.optional(),
      sizes: z.array(runtimeLayoutTrackSizeSchema).optional(),
    }),
    z.strictObject({
      type: z.literal("column"), id: nonBlankStringSchema,
      children: z.array(runtimeLayoutNodeSchema),
      gap: nonNegativeNumberSchema.optional(),
      sizes: z.array(runtimeLayoutTrackSizeSchema).optional(),
    }),
    z.strictObject({
      type: z.literal("stack"), id: nonBlankStringSchema,
      children: z.array(runtimeLayoutNodeSchema),
      active: nonBlankStringSchema.optional(),
    }),
    z.strictObject({
      type: z.literal("panel"), id: nonBlankStringSchema,
      child: runtimeLayoutNodeSchema,
      width: runtimePanelDimensionSchema.optional(),
      height: runtimePanelDimensionSchema.optional(),
      minWidth: nonNegativeNumberSchema.optional(),
      maxWidth: nonNegativeNumberSchema.optional(),
      resizable: z.boolean().optional(),
    }),
    z.strictObject({
      type: z.literal("slot"), id: nonBlankStringSchema,
      slotId: nonBlankStringSchema,
    }),
  ]),
);

export const appUIRuntimePluginInstanceSchema: z.ZodType<AppUIRuntimePluginInstance> =
  z.strictObject({
    id: nonBlankStringSchema,
    pluginId: nonBlankStringSchema,
    enabled: z.boolean(),
    mount: z.strictObject({
      slotId: nonBlankStringSchema,
      order: z.number().finite().optional(),
    }).optional(),
    props: z.record(z.string(), z.unknown()).optional(),
  });

const appUIRuntimeModelShapeSchema: z.ZodType<AppUIRuntimeModel> = z.strictObject({
  root: runtimeLayoutNodeSchema,
  pluginInstances: z.record(z.string(), appUIRuntimePluginInstanceSchema),
  settings: z.strictObject({ theme: nonBlankStringSchema.optional() }).optional(),
});

export const appUIRuntimeModelSchema = appUIRuntimeModelShapeSchema.superRefine(
  (model, context) => {
    for (const [key, instance] of Object.entries(model.pluginInstances)) {
      if (key !== instance.id) {
        context.addIssue({
          code: "custom",
          path: ["pluginInstances", key, "id"],
          message: `Runtime plugin instance key "${key}" must match id "${instance.id}"`,
          input: instance.id,
        });
      }
    }
    const nodeIds = new Set<string>();
    const slotIds = new Set<string>();
    const visit = (node: LayoutNode, path: PropertyKey[]): void => {
      if (nodeIds.has(node.id)) {
        context.addIssue({ code: "custom", path: [...path, "id"], message: `Duplicate Runtime layout node id "${node.id}"`, input: node.id });
      }
      nodeIds.add(node.id);
      if (node.type === "row" || node.type === "column") {
        if (node.sizes !== undefined && node.sizes.length !== node.children.length) {
          context.addIssue({ code: "custom", path: [...path, "sizes"], message: "sizes must contain exactly one entry for each child", input: node.sizes });
        }
        node.children.forEach((child, index) => visit(child, [...path, "children", index]));
      } else if (node.type === "stack") {
        if (node.active !== undefined && !node.children.some((child) => child.id === node.active)) {
          context.addIssue({ code: "custom", path: [...path, "active"], message: `Stack active id "${node.active}" must reference a direct child`, input: node.active });
        }
        node.children.forEach((child, index) => visit(child, [...path, "children", index]));
      } else if (node.type === "panel") {
        if (node.minWidth !== undefined && node.maxWidth !== undefined && node.minWidth > node.maxWidth) {
          context.addIssue({ code: "custom", path: [...path, "minWidth"], message: "minWidth must not be greater than maxWidth", input: node.minWidth });
        }
        visit(node.child, [...path, "child"]);
      } else if (slotIds.has(node.slotId)) {
        context.addIssue({ code: "custom", path: [...path, "slotId"], message: `Runtime Layout Slot "${node.slotId}" is rendered by more than one node`, input: node.slotId });
      } else {
        slotIds.add(node.slotId);
      }
    };
    visit(model.root, ["root"]);
  },
);

export function parseAppUIRuntimeModel(input: unknown): AppUIRuntimeModel {
  return appUIRuntimeModelSchema.parse(input);
}

export function parseAppUIRuntimeModelJson(source: string): AppUIRuntimeModel {
  return parseAppUIRuntimeModel(JSON.parse(source));
}
