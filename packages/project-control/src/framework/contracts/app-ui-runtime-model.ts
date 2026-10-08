import type { LayoutNode, LayoutTrackSize, PanelDimension, RowDrawerPolicy } from "@agent-ui/runtime-react";
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
  SidebarNode as RuntimeSidebarNode,
  StackNode as RuntimeStackNode,
} from "@agent-ui/runtime-react";

export interface AppUIRuntimePluginInstance {
  id: string;
  pluginId: string;
  enabled: boolean;
  mount?: { slotId: string; order?: number | undefined } | undefined;
}

export interface AppUIRuntimeModel {
  root: LayoutNode;
  pluginInstances: Record<string, AppUIRuntimePluginInstance>;
}

const nonBlankStringSchema = z.string().refine(
  (value) => value.trim().length > 0,
  "Must not be blank",
);
const nonNegativeNumberSchema = z.number().nonnegative();
const rowDrawerPolicySchema: z.ZodType<RowDrawerPolicy> = z.strictObject({
  type: z.literal("trailing-drawer"),
  primaryIndex: z.number().int().nonnegative(),
  drawerIndex: z.number().int().nonnegative(),
  minPrimaryWidth: z.number().positive().finite(),
});

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
      type: z.literal("sidebar"), id: nonBlankStringSchema,
      defaultActive: nonBlankStringSchema.nullable(),
      items: z.array(z.strictObject({ id: nonBlankStringSchema, child: z.strictObject({ type: z.literal("slot"), id: nonBlankStringSchema, slotId: nonBlankStringSchema }) })),
      content: runtimeLayoutNodeSchema,
    }),
    z.strictObject({
      type: z.literal("row"), id: nonBlankStringSchema,
      children: z.array(runtimeLayoutNodeSchema),
      gap: nonNegativeNumberSchema.optional(),
      sizes: z.array(runtimeLayoutTrackSizeSchema).optional(),
      responsive: rowDrawerPolicySchema.optional(),
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
  });

const appUIRuntimeModelShapeSchema: z.ZodType<AppUIRuntimeModel> = z.strictObject({
  root: runtimeLayoutNodeSchema,
  pluginInstances: z.record(z.string(), appUIRuntimePluginInstanceSchema),
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
        if (node.type === "row" && node.responsive !== undefined && (
            node.responsive.primaryIndex >= node.children.length ||
            node.responsive.primaryIndex >= node.responsive.drawerIndex ||
            node.responsive.drawerIndex > node.children.length)) {
          context.addIssue({ code: "custom", path: [...path, "responsive"], message: "Row responsive indices must identify an existing primary child and a drawer position at or before the end", input: node.responsive });
        }
        node.children.forEach((child, index) => visit(child, [...path, "children", index]));
      } else if (node.type === "stack") {
        if (node.active !== undefined && !node.children.some((child) => child.id === node.active)) {
          context.addIssue({ code: "custom", path: [...path, "active"], message: `Stack active id "${node.active}" must reference a direct child`, input: node.active });
        }
        node.children.forEach((child, index) => visit(child, [...path, "children", index]));
      } else if (node.type === "sidebar") {
        const ids = node.items.map(item => item.id);
        if (new Set(ids).size !== ids.length || (node.defaultActive !== null && !ids.includes(node.defaultActive))) context.addIssue({ code: "custom", path, message: "Invalid Sidebar items/defaultActive" });
        node.items.forEach((item, index) => {
          const instances = Object.values(model.pluginInstances).filter(instance => instance.mount?.slotId === item.child.slotId);
          if (instances.length !== 1) context.addIssue({ code: "custom", path: [...path, "items", index], message: "Sidebar item Slot must contain exactly one plugin instance" });
          visit(item.child, [...path, "items", index, "child"]);
        });
        visit(node.content, [...path, "content"]);
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
