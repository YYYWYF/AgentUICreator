import type { LayoutSize } from "@agent-ui/runtime-react";
import { z } from "zod";

export type AppUILayoutSize = LayoutSize;
export type LayoutRef = string;

export interface AppUIPluginNode {
  id: string;
  pluginId: string;
  enabled: boolean;
  props?: Record<string, unknown> | undefined;
  slots?: Record<string, AppUIPluginNode[]> | undefined;
}

export interface AppUIRowNode {
  type: "row";
  children: AppUILayoutNode[];
  gap?: number | undefined;
  sizes?: AppUILayoutSize[] | undefined;
}

export interface AppUIColumnNode {
  type: "column";
  children: AppUILayoutNode[];
  gap?: number | undefined;
  sizes?: AppUILayoutSize[] | undefined;
}

export interface AppUIStackNode {
  type: "stack";
  children: AppUILayoutNode[];
  activeIndex?: number | undefined;
}

export interface AppUIPanelNode {
  type: "panel";
  child: AppUILayoutNode;
  width?: AppUILayoutSize | undefined;
  height?: AppUILayoutSize | undefined;
  minWidth?: number | undefined;
  maxWidth?: number | undefined;
  resizable?: boolean | undefined;
}

export interface AppUISlotNode {
  type: "slot";
  plugins: AppUIPluginNode[];
}

export type AppUILayoutNode =
  | AppUIRowNode
  | AppUIColumnNode
  | AppUIStackNode
  | AppUIPanelNode
  | AppUISlotNode;

export interface AppUIModel {
  applicationPlugins?: AppUIPluginNode[] | undefined;
  root: AppUILayoutNode;
  settings?: { theme?: string | undefined } | undefined;
}

export interface AppUILayoutWalkEntry {
  node: AppUILayoutNode;
  path: string;
  parent?: AppUILayoutNode | undefined;
  parentKind: "root" | "children" | "panel";
  index?: number | undefined;
}

export interface AppUILayoutRefIndex {
  byRef: Map<LayoutRef, AppUILayoutNode>;
  byNode: WeakMap<object, LayoutRef>;
  byPath: Map<string, LayoutRef>;
  entries: AppUILayoutWalkEntry[];
}

export interface AppUIPluginLocation {
  plugin: AppUIPluginNode;
  target:
    | { type: "application" }
    | { type: "layout_slot"; slotPath: string; slotNode: AppUISlotNode }
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
      type: z.literal("row"),
      children: z.array(layoutNodeSchema),
      gap: nonNegativeNumberSchema.optional(),
      sizes: z.array(layoutSizeSchema).optional(),
    }),
    z.strictObject({
      type: z.literal("column"),
      children: z.array(layoutNodeSchema),
      gap: nonNegativeNumberSchema.optional(),
      sizes: z.array(layoutSizeSchema).optional(),
    }),
    z.strictObject({
      type: z.literal("stack"),
      children: z.array(layoutNodeSchema),
      activeIndex: z.number().int().nonnegative().optional(),
    }),
    z.strictObject({
      type: z.literal("panel"),
      child: layoutNodeSchema,
      width: layoutSizeSchema.optional(),
      height: layoutSizeSchema.optional(),
      minWidth: nonNegativeNumberSchema.optional(),
      maxWidth: nonNegativeNumberSchema.optional(),
      resizable: z.boolean().optional(),
    }),
    z.strictObject({
      type: z.literal("slot"),
      plugins: z.array(appUIPluginNodeSchema),
    }),
  ]),
);

const appUIModelShapeSchema: z.ZodType<AppUIModel> = z.strictObject({
  applicationPlugins: z.array(appUIPluginNodeSchema).optional(),
  root: layoutNodeSchema,
  settings: z.strictObject({ theme: nonBlankStringSchema.optional() }).optional(),
});

export function walkAppUILayout(root: AppUILayoutNode): AppUILayoutWalkEntry[] {
  const entries: AppUILayoutWalkEntry[] = [];
  const visit = (
    node: AppUILayoutNode,
    path: string,
    parent: AppUILayoutNode | undefined,
    parentKind: AppUILayoutWalkEntry["parentKind"],
    index?: number,
  ): void => {
    entries.push({ node, path, parent, parentKind, ...(index === undefined ? {} : { index }) });
    if (node.type === "row" || node.type === "column" || node.type === "stack") {
      node.children.forEach((child, childIndex) =>
        visit(child, `${path}.children[${childIndex}]`, node, "children", childIndex),
      );
    } else if (node.type === "panel") {
      visit(node.child, `${path}.child`, node, "panel");
    }
  };
  visit(root, "root", undefined, "root");
  return entries;
}

export function buildLayoutRefIndex(root: AppUILayoutNode): AppUILayoutRefIndex {
  const entries = walkAppUILayout(root);
  const byRef = new Map<LayoutRef, AppUILayoutNode>();
  const byNode = new WeakMap<object, LayoutRef>();
  const byPath = new Map<string, LayoutRef>();
  entries.forEach((entry, index) => {
    const ref = `l${index}`;
    byRef.set(ref, entry.node);
    byNode.set(entry.node, ref);
    byPath.set(entry.path, ref);
  });
  return { byRef, byNode, byPath, entries };
}

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
  for (const entry of walkAppUILayout(model.root)) {
    if (entry.node.type === "slot") {
      visitPlugins(
        entry.node.plugins,
        { type: "layout_slot", slotPath: entry.path, slotNode: entry.node },
        `${entry.path}.plugins`,
      );
    }
  }
  return result;
}

export function findAppUIPlugin(
  model: AppUIModel,
  instanceId: string,
): AppUIPluginNode | undefined {
  return collectAppUIPluginLocations(model).find(({ plugin }) => plugin.id === instanceId)?.plugin;
}

export const appUIModelSchema = appUIModelShapeSchema.superRefine((model, context) => {
  const visitLayout = (node: AppUILayoutNode, path: PropertyKey[]): void => {
    if (node.type === "row" || node.type === "column") {
      if (node.sizes !== undefined && node.sizes.length !== node.children.length) {
        context.addIssue({ code: "custom", path: [...path, "sizes"], message: "sizes must contain exactly one entry for each child", input: node.sizes });
      }
      node.children.forEach((child, index) => visitLayout(child, [...path, "children", index]));
    } else if (node.type === "stack") {
      if (node.activeIndex !== undefined && node.activeIndex >= node.children.length) {
        context.addIssue({ code: "custom", path: [...path, "activeIndex"], message: "activeIndex must be less than children.length", input: node.activeIndex });
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
