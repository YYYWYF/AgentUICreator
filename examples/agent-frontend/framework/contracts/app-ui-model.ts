import type { LayoutSize } from "@agent-ui/runtime-react";
import { z } from "zod";

export const APP_UI_MODEL_VERSION = "3" as const;
export type AppUILayoutSize = LayoutSize;

export interface AppUIPluginNode {
  id: string;
  pluginId: string;
  enabled: boolean;
  props?: Record<string, unknown> | undefined;
  slots?: Record<string, AppUIPluginNode[]> | undefined;
}

export interface AppUIRowNode {
  type: "row";
  id: string;
  children: AppUILayoutNode[];
  gap?: number | undefined;
  sizes?: AppUILayoutSize[] | undefined;
}

export interface AppUIColumnNode {
  type: "column";
  id: string;
  children: AppUILayoutNode[];
  gap?: number | undefined;
  sizes?: AppUILayoutSize[] | undefined;
}

export interface AppUIStackNode {
  type: "stack";
  id: string;
  children: AppUILayoutNode[];
  active?: string | undefined;
}

export interface AppUIPanelNode {
  type: "panel";
  id: string;
  child: AppUILayoutNode;
  width?: AppUILayoutSize | undefined;
  height?: AppUILayoutSize | undefined;
  minWidth?: number | undefined;
  maxWidth?: number | undefined;
  resizable?: boolean | undefined;
}

export interface AppUISlotNode {
  type: "slot";
  id: string;
  description: string;
  plugins: AppUIPluginNode[];
}

export type AppUILayoutNode =
  | AppUIRowNode
  | AppUIColumnNode
  | AppUIStackNode
  | AppUIPanelNode
  | AppUISlotNode;

export interface AppUIModel {
  version: typeof APP_UI_MODEL_VERSION;
  applicationPlugins?: AppUIPluginNode[] | undefined;
  root: AppUILayoutNode;
  settings?: { theme?: string | undefined } | undefined;
}

export interface AppUIPluginLocation {
  plugin: AppUIPluginNode;
  target:
    | { type: "application" }
    | { type: "layout_slot"; slotNodeId: string }
    | { type: "plugin_slot"; parentInstanceId: string; slot: string };
  path: string;
  index: number;
}

const nonBlankStringSchema = z.string().refine(
  (value) => value.trim().length > 0,
  "Must not be blank",
);
const nonNegativeNumberSchema = z.number().nonnegative();

export const layoutSizeSchema: z.ZodType<AppUILayoutSize> = z.union([
  nonNegativeNumberSchema,
  nonBlankStringSchema,
]);

export const appUIPluginNodeSchema: z.ZodType<AppUIPluginNode> = z.lazy(() =>
  z.strictObject({
    id: nonBlankStringSchema,
    pluginId: nonBlankStringSchema,
    enabled: z.boolean(),
    props: z.record(z.string(), z.unknown()).optional(),
    slots: z.record(nonBlankStringSchema, z.array(appUIPluginNodeSchema)).optional(),
  }),
);

export const layoutNodeSchema: z.ZodType<AppUILayoutNode> = z.lazy(() =>
  z.union([
    z.strictObject({
      type: z.literal("row"), id: nonBlankStringSchema,
      children: z.array(layoutNodeSchema),
      gap: nonNegativeNumberSchema.optional(),
      sizes: z.array(layoutSizeSchema).optional(),
    }),
    z.strictObject({
      type: z.literal("column"), id: nonBlankStringSchema,
      children: z.array(layoutNodeSchema),
      gap: nonNegativeNumberSchema.optional(),
      sizes: z.array(layoutSizeSchema).optional(),
    }),
    z.strictObject({
      type: z.literal("stack"), id: nonBlankStringSchema,
      children: z.array(layoutNodeSchema),
      active: nonBlankStringSchema.optional(),
    }),
    z.strictObject({
      type: z.literal("panel"), id: nonBlankStringSchema,
      child: layoutNodeSchema,
      width: layoutSizeSchema.optional(),
      height: layoutSizeSchema.optional(),
      minWidth: nonNegativeNumberSchema.optional(),
      maxWidth: nonNegativeNumberSchema.optional(),
      resizable: z.boolean().optional(),
    }),
    z.strictObject({
      type: z.literal("slot"), id: nonBlankStringSchema,
      description: nonBlankStringSchema,
      plugins: z.array(appUIPluginNodeSchema),
    }),
  ]),
);

const appUIModelShapeSchema: z.ZodType<AppUIModel> = z.strictObject({
  version: z.literal(APP_UI_MODEL_VERSION),
  applicationPlugins: z.array(appUIPluginNodeSchema).optional(),
  root: layoutNodeSchema,
  settings: z.strictObject({ theme: nonBlankStringSchema.optional() }).optional(),
});

export function collectAppUIPluginLocations(model: AppUIModel): AppUIPluginLocation[] {
  const result: AppUIPluginLocation[] = [];
  const visitPlugins = (
    plugins: readonly AppUIPluginNode[],
    target: AppUIPluginLocation["target"],
    path: string,
  ): void => {
    plugins.forEach((plugin, index) => {
      result.push({ plugin, target, path: `${path}[${index}]`, index });
      for (const [slot, children] of Object.entries(plugin.slots ?? {})) {
        visitPlugins(
          children,
          { type: "plugin_slot", parentInstanceId: plugin.id, slot },
          `${path}[${index}].slots.${slot}`,
        );
      }
    });
  };
  visitPlugins(model.applicationPlugins ?? [], { type: "application" }, "applicationPlugins");
  const visitLayout = (node: AppUILayoutNode, path: string): void => {
    if (node.type === "slot") {
      visitPlugins(node.plugins, { type: "layout_slot", slotNodeId: node.id }, `${path}.plugins`);
    } else if (node.type === "panel") {
      visitLayout(node.child, `${path}.child`);
    } else {
      node.children.forEach((child, index) => visitLayout(child, `${path}.children[${index}]`));
    }
  };
  visitLayout(model.root, "root");
  return result;
}

export function findAppUIPlugin(
  model: AppUIModel,
  instanceId: string,
): AppUIPluginNode | undefined {
  return collectAppUIPluginLocations(model).find(({ plugin }) => plugin.id === instanceId)?.plugin;
}

export const appUIModelSchema = appUIModelShapeSchema.superRefine((model, context) => {
  const layoutIds = new Set<string>();
  const visitLayout = (node: AppUILayoutNode, path: PropertyKey[]): void => {
    if (layoutIds.has(node.id)) {
      context.addIssue({ code: "custom", path: [...path, "id"], message: `Duplicate layout node id "${node.id}"`, input: node.id });
    }
    layoutIds.add(node.id);
    if (node.type === "row" || node.type === "column") {
      if (node.sizes !== undefined && node.sizes.length !== node.children.length) {
        context.addIssue({ code: "custom", path: [...path, "sizes"], message: "sizes must contain exactly one entry for each child", input: node.sizes });
      }
      node.children.forEach((child, index) => visitLayout(child, [...path, "children", index]));
    } else if (node.type === "stack") {
      if (node.active !== undefined && !node.children.some((child) => child.id === node.active)) {
        context.addIssue({ code: "custom", path: [...path, "active"], message: `Stack active id "${node.active}" must reference a direct child`, input: node.active });
      }
      node.children.forEach((child, index) => visitLayout(child, [...path, "children", index]));
    } else if (node.type === "panel") {
      if (node.minWidth !== undefined && node.maxWidth !== undefined && node.minWidth > node.maxWidth) {
        context.addIssue({ code: "custom", path: [...path, "minWidth"], message: "minWidth must not be greater than maxWidth", input: node.minWidth });
      }
      visitLayout(node.child, [...path, "child"]);
    }
  };
  visitLayout(model.root, ["root"]);

  const instanceIds = new Set<string>();
  for (const { plugin, path } of collectAppUIPluginLocations(model)) {
    if (instanceIds.has(plugin.id)) {
      context.addIssue({ code: "custom", path: path.split("."), message: `Duplicate plugin instance id "${plugin.id}"`, input: plugin.id });
    }
    instanceIds.add(plugin.id);
  }
});

export function parseAppUIModel(input: unknown): AppUIModel {
  return appUIModelSchema.parse(input);
}

export function parseAppUIModelJson(source: string): AppUIModel {
  return parseAppUIModel(JSON.parse(source));
}
