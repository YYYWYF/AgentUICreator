import type { LayoutTrackSize, PanelDimension, RowDrawerPolicy } from "@za38.03/agent-ui-renderer";
import { z } from "zod";
import { isGridTrackOnlyDimension } from "./panel-dimension";

export type AppUILayoutTrackSize = LayoutTrackSize;
export type AppUIPanelDimension = PanelDimension;
export type LayoutRef = string;

export interface AppUIPluginNode {
  /** Normalized identity. Authoring JSON may omit it for structural identity. */
  id: string;
  pluginId: string;
  /** Normalized value; authoring JSON may omit this to enable the instance. */
  enabled: boolean;
  slots?: Record<string, AppUIPluginNode[]> | undefined;
}

export interface AppUIRowNode {
  type: "row";
  children: AppUILayoutNode[];
  gap?: number | undefined;
  sizes?: AppUILayoutTrackSize[] | undefined;
  responsive?: RowDrawerPolicy | undefined;
}

export interface AppUIColumnNode {
  type: "column";
  children: AppUILayoutNode[];
  gap?: number | undefined;
  sizes?: AppUILayoutTrackSize[] | undefined;
}

export interface AppUIStackNode {
  type: "stack";
  children: AppUILayoutNode[];
  activeIndex?: number | undefined;
}

export interface AppUIPanelNode {
  type: "panel";
  child: AppUILayoutNode;
  width?: AppUIPanelDimension | undefined;
  height?: AppUIPanelDimension | undefined;
  minWidth?: number | undefined;
  maxWidth?: number | undefined;
  resizable?: boolean | undefined;
}

export interface AppUISlotNode {
  type: "slot";
  plugins: AppUIPluginNode[];
}

export interface AppUISidebarNode {
  type: "sidebar";
  defaultActive: string | null;
  header?: AppUISlotNode | undefined;
  footer?: AppUISlotNode | undefined;
  items: { id: string; child: AppUISlotNode }[];
  content: AppUILayoutNode;
}

export type AppUILayoutNode =
  | AppUISidebarNode
  | AppUIRowNode
  | AppUIColumnNode
  | AppUIStackNode
  | AppUIPanelNode
  | AppUISlotNode;

export interface AppUIModel {
  applicationPlugins?: AppUIPluginNode[] | undefined;
  root: AppUILayoutNode;
}

// Provenance belongs to the parsed object, never to JSON or a second persisted
// identity registry. Explicit IDs (including auto-looking strings) stay explicit.
const generatedPluginNodes = new WeakSet<object>();

export function hasGeneratedAppUIId(node: object): boolean {
  return generatedPluginNodes.has(node);
}

export function stripGeneratedAppUIIds(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripGeneratedAppUIIds);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => key !== "id" || !generatedPluginNodes.has(value))
    .map(([key, child]) => [key, stripGeneratedAppUIIds(child)]));
}

/** Clone editable composition values without losing identity provenance. */
export function cloneAppUIValue<T>(value: T): T {
  const cloned = structuredClone(value);
  const copy = (source: unknown, target: unknown): void => {
    if (source === null || typeof source !== "object" || target === null || typeof target !== "object") return;
    if (generatedPluginNodes.has(source)) generatedPluginNodes.add(target);
    for (const key of Object.keys(source)) copy((source as Record<string, unknown>)[key], (target as Record<string, unknown>)[key]);
  };
  copy(value, cloned);
  return cloned;
}

/** Pure, browser-safe IDs from logical structure; no native paths or randomness. */
export function assignGeneratedAppUIIds<T>(value: T, seed = "model"): T {
  const nodes: { node: AppUIPluginNode; path: (string | number)[] }[] = [];
  const visit = (current: unknown, path: (string | number)[]): void => {
    if (Array.isArray(current)) { current.forEach((child, index) => visit(child, [...path, index])); return; }
    if (current === null || typeof current !== "object") return;
    const record = current as Record<string, unknown>;
    if (typeof record.pluginId === "string" && typeof record.id === "string") nodes.push({ node: current as AppUIPluginNode, path });
    for (const [key, child] of Object.entries(record)) if (key !== "id") visit(child, [...path, key]);
  };
  visit(value, []);
  const used = new Set(nodes.filter(({ node }) => node.id !== "" && !generatedPluginNodes.has(node)).map(({ node }) => node.id));
  for (const { node, path } of nodes) {
    if (node.id !== "" && !generatedPluginNodes.has(node)) continue;
    let hash = 0xcbf29ce484222325n;
    for (const character of JSON.stringify([seed, path, node.pluginId])) {
      hash = BigInt.asUintN(64, (hash ^ BigInt(character.codePointAt(0)!)) * 0x100000001b3n);
    }
    const base = `auto_${hash.toString(16).padStart(16, "0")}`;
    let id = base;
    for (let suffix = 1; used.has(id); suffix++) id = `${base}_${suffix}`;
    node.id = id;
    generatedPluginNodes.add(node);
    used.add(id);
  }
  return value;
}

export interface AppUILayoutWalkEntry {
  node: AppUILayoutNode;
  path: string;
  parent?: AppUILayoutNode | undefined;
  parentKind: "root" | "children" | "panel" | "sidebar-item" | "sidebar-header" | "sidebar-footer" | "sidebar-content";
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
export const rowDrawerPolicySchema: z.ZodType<RowDrawerPolicy> = z.strictObject({
  type: z.literal("trailing-drawer"),
  primaryIndex: z.number().int().nonnegative(),
  drawerIndex: z.number().int().nonnegative(),
  minPrimaryWidth: z.number().positive().finite(),
});

export const layoutTrackSizeSchema: z.ZodType<AppUILayoutTrackSize> = z.union([
  nonNegativeNumberSchema,
  nonBlankStringSchema,
]);

export const panelDimensionSchema: z.ZodType<AppUIPanelDimension> = z.union([
  nonNegativeNumberSchema,
  nonBlankStringSchema.refine(
    (value) => !isGridTrackOnlyDimension(value),
    "Panel width/height must be a CSS element dimension, not Grid track syntax",
  ),
]);

export const appUIPluginNodeSchema: z.ZodType<AppUIPluginNode> = z.lazy(() =>
  z.preprocess(stripGeneratedAppUIIds, z.strictObject({
    id: nonBlankStringSchema.default(""),
    pluginId: nonBlankStringSchema,
    enabled: z.boolean().default(true),
    slots: z.record(nonBlankStringSchema, z.array(appUIPluginNodeSchema)).optional(),
  }).transform(node => assignGeneratedAppUIIds(node, "node"))),
);

export const layoutNodeSchema: z.ZodType<AppUILayoutNode> = z.lazy(() =>
  z.union([
    z.strictObject({
      type: z.literal("sidebar"),
      defaultActive: nonBlankStringSchema.nullable(),
      header: z.strictObject({ type: z.literal("slot"), plugins: z.array(appUIPluginNodeSchema).max(1) }).optional(),
      footer: z.strictObject({ type: z.literal("slot"), plugins: z.array(appUIPluginNodeSchema).max(1) }).optional(),
      items: z.array(z.strictObject({ id: nonBlankStringSchema, child: z.strictObject({ type: z.literal("slot"), plugins: z.array(appUIPluginNodeSchema).length(1) }) })),
      content: layoutNodeSchema,
    }),
    z.strictObject({
      type: z.literal("row"),
      children: z.array(layoutNodeSchema),
      gap: nonNegativeNumberSchema.optional(),
      sizes: z.array(layoutTrackSizeSchema).optional(),
      responsive: rowDrawerPolicySchema.optional(),
    }),
    z.strictObject({
      type: z.literal("column"),
      children: z.array(layoutNodeSchema),
      gap: nonNegativeNumberSchema.optional(),
      sizes: z.array(layoutTrackSizeSchema).optional(),
    }),
    z.strictObject({
      type: z.literal("stack"),
      children: z.array(layoutNodeSchema),
      activeIndex: z.number().int().nonnegative().optional(),
    }),
    z.strictObject({
      type: z.literal("panel"),
      child: layoutNodeSchema,
      width: panelDimensionSchema.optional(),
      height: panelDimensionSchema.optional(),
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
    } else if (node.type === "sidebar") {
      if (node.header) visit(node.header, `${path}.header`, node, "sidebar-header");
      if (node.footer) visit(node.footer, `${path}.footer`, node, "sidebar-footer");
      node.items.forEach((item, index) => visit(item.child, `${path}.items[${index}].child`, node, "sidebar-item", index));
      visit(node.content, `${path}.content`, node, "sidebar-content");
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

export const appUIModelSchema = z.preprocess(stripGeneratedAppUIIds,
  appUIModelShapeSchema.transform(model => assignGeneratedAppUIIds(model)),
).superRefine((model, context) => {
  const visitLayout = (node: AppUILayoutNode, path: PropertyKey[]): void => {
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
      node.children.forEach((child, index) => visitLayout(child, [...path, "children", index]));
    } else if (node.type === "stack") {
      if (node.activeIndex !== undefined && node.activeIndex >= node.children.length) {
        context.addIssue({ code: "custom", path: [...path, "activeIndex"], message: "activeIndex must be less than children.length", input: node.activeIndex });
      }
      node.children.forEach((child, index) => visitLayout(child, [...path, "children", index]));
    } else if (node.type === "sidebar") {
      const ids = node.items.map(item => item.id);
      if (new Set(ids).size !== ids.length || (node.defaultActive !== null && !ids.includes(node.defaultActive))) {
        context.addIssue({ code: "custom", path, message: "Sidebar item ids must be unique and defaultActive must reference an item or be null" });
      }
      if (node.header) visitLayout(node.header, [...path, "header"]);
      if (node.footer) visitLayout(node.footer, [...path, "footer"]);
      node.items.forEach((item, index) => visitLayout(item.child, [...path, "items", index, "child"]));
      visitLayout(node.content, [...path, "content"]);
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
