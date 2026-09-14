import { z } from "zod";

import {
  appUIPluginNodeSchema,
  collectAppUIPluginLocations,
  layoutNodeSchema,
  layoutSizeSchema,
  type AppUIColumnNode,
  type AppUILayoutNode,
  type AppUILayoutSize,
  type AppUIModel,
  type AppUIPanelNode,
  type AppUIPluginLocation,
  type AppUIPluginNode,
  type AppUIRowNode,
  type AppUIStackNode,
} from "../../framework/contracts/app-ui-model";

const nonBlankStringSchema = z.string().trim().min(1).max(200);
const indexSchema = z.number().int().nonnegative().optional();
const removeKeysSchema = z.array(nonBlankStringSchema).max(50).optional();

export const appUIPluginTargetSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("application") }),
  z.strictObject({
    type: z.literal("layout_slot"),
    slotNodeId: nonBlankStringSchema,
  }),
  z.strictObject({
    type: z.literal("plugin_slot"),
    parentInstanceId: nonBlankStringSchema,
    slot: nonBlankStringSchema,
  }),
]);

export const appUIOperationSchema = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("insert_plugin"),
    plugin: appUIPluginNodeSchema,
    target: appUIPluginTargetSchema,
    index: indexSchema,
  }),
  z.strictObject({
    type: z.literal("move_plugin"),
    instanceId: nonBlankStringSchema,
    target: appUIPluginTargetSchema,
    index: indexSchema,
  }),
  z.strictObject({
    type: z.literal("remove_plugin"),
    instanceId: nonBlankStringSchema,
  }),
  z.strictObject({
    type: z.literal("replace_plugin"),
    instanceId: nonBlankStringSchema,
    replacement: appUIPluginNodeSchema,
  }),
  z.strictObject({
    type: z.literal("update_plugin_props"),
    instanceId: nonBlankStringSchema,
    set: z.record(z.string(), z.unknown()).optional(),
    removeKeys: removeKeysSchema,
  }),
  z.strictObject({
    type: z.literal("set_plugin_enabled"),
    instanceId: nonBlankStringSchema,
    enabled: z.boolean(),
  }),
  z.strictObject({
    type: z.literal("insert_layout_node"),
    parentNodeId: nonBlankStringSchema,
    node: layoutNodeSchema,
    index: indexSchema,
    size: layoutSizeSchema.optional(),
  }),
  z.strictObject({
    type: z.literal("update_layout_node_props"),
    nodeId: nonBlankStringSchema,
    set: z.record(z.string(), z.unknown()).optional(),
    removeKeys: removeKeysSchema,
  }),
  z.strictObject({
    type: z.literal("move_layout_node"),
    nodeId: nonBlankStringSchema,
    newParentNodeId: nonBlankStringSchema,
    index: indexSchema,
    size: layoutSizeSchema.optional(),
  }),
  z.strictObject({
    type: z.literal("replace_layout_node"),
    nodeId: nonBlankStringSchema,
    node: layoutNodeSchema,
  }),
  z.strictObject({
    type: z.literal("remove_layout_node"),
    nodeId: nonBlankStringSchema,
  }),
]);

export const appUIOperationsSchema = z.array(appUIOperationSchema).min(1).max(100);
export type AppUIOperation = z.infer<typeof appUIOperationSchema>;
export type AppUIPluginTarget = z.infer<typeof appUIPluginTargetSchema>;

type ChildrenNode = AppUIRowNode | AppUIColumnNode | AppUIStackNode;

export interface NodeIndexEntry {
  node: AppUILayoutNode;
  path: string;
  parent?: AppUILayoutNode | undefined;
  parentKind: "root" | "children" | "panel";
  index?: number | undefined;
}

export class AppUIOperationError extends Error {
  readonly code: string;
  readonly details: unknown;

  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.name = "AppUIOperationError";
    this.code = code;
    this.details = details;
  }
}

function operationError(code: string, message: string, details?: unknown): never {
  throw new AppUIOperationError(code, message, details);
}

export function buildLayoutNodeIndex(root: AppUILayoutNode): Map<string, NodeIndexEntry> {
  const result = new Map<string, NodeIndexEntry>();
  const visit = (
    node: AppUILayoutNode,
    path: string,
    parent: AppUILayoutNode | undefined,
    parentKind: NodeIndexEntry["parentKind"],
    index?: number,
  ): void => {
    if (result.has(node.id)) {
      operationError("DUPLICATE_LAYOUT_NODE_ID", `Layout node id "${node.id}" is duplicated.`);
    }
    result.set(node.id, { node, path, parent, parentKind, ...(index === undefined ? {} : { index }) });
    if (node.type === "row" || node.type === "column" || node.type === "stack") {
      node.children.forEach((child, childIndex) =>
        visit(child, `${path}.children[${childIndex}]`, node, "children", childIndex),
      );
    } else if (node.type === "panel") {
      visit(node.child, `${path}.child`, node, "panel");
    }
  };
  visit(root, "root", undefined, "root");
  return result;
}

function requiredNode(model: AppUIModel, nodeId: string): NodeIndexEntry {
  const entry = buildLayoutNodeIndex(model.root).get(nodeId);
  if (entry === undefined) operationError("LAYOUT_NODE_NOT_FOUND", `Layout node "${nodeId}" does not exist.`);
  return entry;
}

function requiredPluginLocation(model: AppUIModel, instanceId: string): AppUIPluginLocation {
  const location = collectAppUIPluginLocations(model).find(({ plugin }) => plugin.id === instanceId);
  if (location === undefined) operationError("PLUGIN_NOT_FOUND", `Plugin instance "${instanceId}" does not exist.`);
  return location;
}

function insertAt<T>(items: T[], item: T, index: number | undefined, label: string): void {
  const targetIndex = index ?? items.length;
  if (targetIndex > items.length) {
    operationError("INDEX_OUT_OF_RANGE", `${label} index ${targetIndex} exceeds length ${items.length}.`);
  }
  items.splice(targetIndex, 0, item);
}

function pluginContainer(model: AppUIModel, target: AppUIPluginTarget): AppUIPluginNode[] {
  if (target.type === "application") {
    model.applicationPlugins ??= [];
    return model.applicationPlugins;
  }
  if (target.type === "layout_slot") {
    const node = requiredNode(model, target.slotNodeId).node;
    if (node.type !== "slot") {
      operationError("LAYOUT_NODE_NOT_SLOT", `Layout node "${target.slotNodeId}" is not a Slot.`);
    }
    return node.plugins;
  }
  const parent = requiredPluginLocation(model, target.parentInstanceId).plugin;
  parent.slots ??= {};
  parent.slots[target.slot] ??= [];
  return parent.slots[target.slot];
}

function sameTarget(left: AppUIPluginTarget, right: AppUIPluginTarget): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function detachPlugin(model: AppUIModel, instanceId: string): {
  plugin: AppUIPluginNode;
  target: AppUIPluginTarget;
  index: number;
} {
  const location = requiredPluginLocation(model, instanceId);
  const container = pluginContainer(model, location.target);
  const [plugin] = container.splice(location.index, 1);
  if (plugin === undefined) operationError("PLUGIN_NOT_FOUND", `Plugin instance "${instanceId}" does not exist.`);
  return { plugin, target: location.target, index: location.index };
}

function pluginSubtreeIds(plugin: AppUIPluginNode): Set<string> {
  const result = new Set<string>();
  const visit = (current: AppUIPluginNode): void => {
    result.add(current.id);
    Object.values(current.slots ?? {}).flat().forEach(visit);
  };
  visit(plugin);
  return result;
}

function assertUniquePluginIds(
  model: AppUIModel,
  plugin: AppUIPluginNode,
  ignoredIds: ReadonlySet<string> = new Set(),
): void {
  const existing = new Set(
    collectAppUIPluginLocations(model)
      .map(({ plugin: current }) => current.id)
      .filter((id) => !ignoredIds.has(id)),
  );
  const visit = (current: AppUIPluginNode): void => {
    if (existing.has(current.id)) {
      operationError("PLUGIN_ALREADY_EXISTS", `Plugin instance "${current.id}" already exists.`);
    }
    existing.add(current.id);
    Object.values(current.slots ?? {}).flat().forEach(visit);
  };
  visit(plugin);
}

function childContainer(node: AppUILayoutNode, operation: string): ChildrenNode {
  if (node.type === "row" || node.type === "column" || node.type === "stack") return node;
  operationError("LAYOUT_PARENT_NOT_CONTAINER", `${operation} requires a row, column, or stack parent; "${node.id}" is ${node.type}.`);
}

function insertChild(
  parent: ChildrenNode,
  node: AppUILayoutNode,
  index: number | undefined,
  size: AppUILayoutSize | undefined,
): void {
  const targetIndex = index ?? parent.children.length;
  if (targetIndex > parent.children.length) operationError("INDEX_OUT_OF_RANGE", `Layout child index ${targetIndex} exceeds length ${parent.children.length}.`);
  if (parent.type === "row" || parent.type === "column") {
    if (parent.sizes !== undefined) {
      if (size === undefined) operationError("LAYOUT_SIZE_REQUIRED", `Parent "${parent.id}" has sizes; the inserted child requires a size.`);
      parent.sizes.splice(targetIndex, 0, size);
    } else if (size !== undefined) {
      operationError("LAYOUT_SIZE_NOT_APPLICABLE", `Parent "${parent.id}" does not define sizes.`);
    }
  } else if (size !== undefined) {
    operationError("LAYOUT_SIZE_NOT_APPLICABLE", `Stack parent "${parent.id}" does not support child sizes.`);
  }
  parent.children.splice(targetIndex, 0, node);
}

function detachChild(entry: NodeIndexEntry): { node: AppUILayoutNode; size?: AppUILayoutSize } {
  if (entry.parentKind !== "children" || entry.parent === undefined || entry.index === undefined) {
    operationError("LAYOUT_NODE_NOT_MOVABLE", `Layout node "${entry.node.id}" is not a child of row, column, or stack.`);
  }
  const parent = childContainer(entry.parent, "detach_layout_node");
  const [node] = parent.children.splice(entry.index, 1);
  let size: AppUILayoutSize | undefined;
  if ((parent.type === "row" || parent.type === "column") && parent.sizes !== undefined) {
    [size] = parent.sizes.splice(entry.index, 1);
  }
  return { node: node!, ...(size === undefined ? {} : { size }) };
}

function subtreePluginIds(node: AppUILayoutNode): string[] {
  const ids: string[] = [];
  const visitPlugin = (plugin: AppUIPluginNode): void => {
    ids.push(plugin.id);
    Object.values(plugin.slots ?? {}).flat().forEach(visitPlugin);
  };
  const visit = (current: AppUILayoutNode): void => {
    if (current.type === "slot") current.plugins.forEach(visitPlugin);
    else if (current.type === "panel") visit(current.child);
    else current.children.forEach(visit);
  };
  visit(node);
  return ids;
}

function assertSubtreeCanDisappear(oldNode: AppUILayoutNode, replacement?: AppUILayoutNode): void {
  const retained = new Set(replacement === undefined ? [] : subtreePluginIds(replacement));
  const disappearing = subtreePluginIds(oldNode).filter((id) => !retained.has(id));
  if (disappearing.length > 0) {
    operationError("LAYOUT_SUBTREE_HAS_PLUGINS", "Move or remove plugins before removing their Layout subtree.", { instanceIds: disappearing.sort() });
  }
}

function replaceNode(model: AppUIModel, entry: NodeIndexEntry, replacement: AppUILayoutNode): void {
  assertSubtreeCanDisappear(entry.node, replacement);
  if (entry.parentKind === "root") { model.root = replacement; return; }
  if (entry.parent === undefined) operationError("LAYOUT_PARENT_NOT_FOUND", `Parent for "${entry.node.id}" is missing.`);
  if (entry.parentKind === "panel") { (entry.parent as AppUIPanelNode).child = replacement; return; }
  if (entry.index === undefined) operationError("LAYOUT_PARENT_NOT_FOUND", `Child index for "${entry.node.id}" is missing.`);
  childContainer(entry.parent, "replace_layout_node").children[entry.index] = replacement;
}

const layoutPropKeys: Record<AppUILayoutNode["type"], ReadonlySet<string>> = {
  row: new Set(["gap", "sizes"]), column: new Set(["gap", "sizes"]),
  stack: new Set(["active"]), panel: new Set(["width", "height", "minWidth", "maxWidth", "resizable"]),
  slot: new Set(["description"]),
};

function updateLayoutNodeProps(node: AppUILayoutNode, set?: Record<string, unknown>, removeKeys?: string[]): void {
  const allowed = layoutPropKeys[node.type];
  for (const key of [...Object.keys(set ?? {}), ...(removeKeys ?? [])]) {
    if (!allowed.has(key)) operationError("LAYOUT_PROP_NOT_MUTABLE", `Property "${key}" cannot be changed on ${node.type} node "${node.id}".`, { allowed: [...allowed] });
  }
  const target = node as unknown as Record<string, unknown>;
  Object.assign(target, set ?? {});
  for (const key of removeKeys ?? []) delete target[key];
}

function applyOperation(model: AppUIModel, operation: AppUIOperation): void {
  switch (operation.type) {
    case "insert_plugin":
      assertUniquePluginIds(model, operation.plugin);
      insertAt(pluginContainer(model, operation.target), structuredClone(operation.plugin), operation.index, "Plugin target");
      return;
    case "move_plugin": {
      const location = requiredPluginLocation(model, operation.instanceId);
      const descendants = new Set<string>();
      const collect = (plugin: AppUIPluginNode): void => {
        descendants.add(plugin.id);
        Object.values(plugin.slots ?? {}).flat().forEach(collect);
      };
      collect(location.plugin);
      if (operation.target.type === "plugin_slot" && descendants.has(operation.target.parentInstanceId)) {
        operationError("PLUGIN_MOVE_CYCLE", `Cannot move "${operation.instanceId}" into its own subtree.`);
      }
      const detached = detachPlugin(model, operation.instanceId);
      const destination = pluginContainer(model, operation.target);
      const adjustedIndex = operation.index !== undefined && sameTarget(detached.target, operation.target) && detached.index < operation.index
        ? operation.index - 1
        : operation.index;
      insertAt(destination, detached.plugin, adjustedIndex, "Plugin target");
      return;
    }
    case "remove_plugin":
      detachPlugin(model, operation.instanceId);
      return;
    case "replace_plugin": {
      const location = requiredPluginLocation(model, operation.instanceId);
      assertUniquePluginIds(
        model,
        operation.replacement,
        pluginSubtreeIds(location.plugin),
      );
      pluginContainer(model, location.target)[location.index] = structuredClone(operation.replacement);
      return;
    }
    case "update_plugin_props": {
      const plugin = requiredPluginLocation(model, operation.instanceId).plugin;
      const props = { ...(plugin.props ?? {}) };
      Object.assign(props, operation.set ?? {});
      for (const key of operation.removeKeys ?? []) delete props[key];
      if (Object.keys(props).length === 0) delete plugin.props;
      else plugin.props = props;
      return;
    }
    case "set_plugin_enabled":
      requiredPluginLocation(model, operation.instanceId).plugin.enabled = operation.enabled;
      return;
    case "insert_layout_node":
      insertChild(childContainer(requiredNode(model, operation.parentNodeId).node, operation.type), structuredClone(operation.node), operation.index, operation.size);
      return;
    case "update_layout_node_props":
      updateLayoutNodeProps(requiredNode(model, operation.nodeId).node, operation.set, operation.removeKeys);
      return;
    case "move_layout_node": {
      if (operation.nodeId === model.root.id) operationError("LAYOUT_ROOT_NOT_MOVABLE", "The Layout root cannot be moved.");
      const beforeIndex = buildLayoutNodeIndex(model.root);
      const entry = beforeIndex.get(operation.nodeId);
      const parentEntry = beforeIndex.get(operation.newParentNodeId);
      if (entry === undefined || parentEntry === undefined) operationError("LAYOUT_NODE_NOT_FOUND", "Layout node or destination parent does not exist.");
      if (buildLayoutNodeIndex(entry.node).has(operation.newParentNodeId)) operationError("LAYOUT_MOVE_CYCLE", `Cannot move "${operation.nodeId}" into its own subtree.`);
      childContainer(parentEntry.node, operation.type);
      const detached = detachChild(entry);
      const destination = childContainer(requiredNode(model, operation.newParentNodeId).node, operation.type);
      const inheritedSize = (destination.type === "row" || destination.type === "column") && destination.sizes !== undefined ? detached.size : undefined;
      insertChild(destination, detached.node, operation.index, operation.size ?? inheritedSize);
      return;
    }
    case "replace_layout_node":
      replaceNode(model, requiredNode(model, operation.nodeId), structuredClone(operation.node));
      return;
    case "remove_layout_node": {
      if (operation.nodeId === model.root.id) operationError("LAYOUT_ROOT_NOT_REMOVABLE", "The Layout root cannot be removed.");
      const entry = requiredNode(model, operation.nodeId);
      assertSubtreeCanDisappear(entry.node);
      detachChild(entry);
      return;
    }
  }
}

export function applyAppUIOperations(source: AppUIModel, operations: readonly AppUIOperation[]): AppUIModel {
  const model = structuredClone(source);
  operations.forEach((operation) => applyOperation(model, operation));
  return model;
}
