import { z } from "zod";

import {
  appUIPluginNodeSchema,
  buildLayoutRefIndex,
  collectAppUIPluginLocations,
  layoutSizeSchema,
  walkAppUILayout,
  type AppUIColumnNode,
  type AppUILayoutNode,
  type AppUILayoutSize,
  type AppUIModel,
  type AppUIPanelNode,
  type AppUIPluginLocation,
  type AppUIPluginNode,
  type AppUIRowNode,
  type AppUIStackNode,
  type LayoutRef,
} from "../../framework/contracts/app-ui-model";

const nonBlankStringSchema = z.string().trim().min(1).max(200);
const LAYOUT_TRACK_SIZE_ERROR =
  'Creator Row/Column track sizes require explicit CSS units or track syntax, for example "280px", "1fr", or "minmax(0, 1fr)".';
const numericOnlyTrackPattern = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/;
const layoutTrackSizeSchema = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .refine((value) => !numericOnlyTrackPattern.test(value), LAYOUT_TRACK_SIZE_ERROR);
const layoutRefSchema = z.string().regex(/^(?:l[0-9]+|\$[A-Za-z][A-Za-z0-9_-]*)$/);
const indexSchema = z.number().int().nonnegative().optional();
const removeKeysSchema = z.array(nonBlankStringSchema).max(50).optional();
const directionSchema = z.enum(["left", "right", "above", "below"]);
const removeReflowSchema = z.enum(["preserve", "collapse-empty-region"]);

type AppUILayoutMutationNode =
  | ({ type: "row" | "column"; children: AppUILayoutMutationNode[]; gap?: number; sizes?: string[] } & { localRef?: string })
  | ({ type: "stack"; children: AppUILayoutMutationNode[]; activeIndex?: number } & { localRef?: string })
  | ({ type: "panel"; child: AppUILayoutMutationNode; width?: AppUILayoutSize; height?: AppUILayoutSize; minWidth?: number; maxWidth?: number; resizable?: boolean } & { localRef?: string })
  | ({ type: "slot"; plugins: AppUIPluginNode[] } & { localRef?: string });

type LayoutNodeProps = {
  gap?: number;
  sizes?: string[];
  activeIndex?: number;
  width?: AppUILayoutSize;
  height?: AppUILayoutSize;
  minWidth?: number;
  maxWidth?: number;
  resizable?: boolean;
};

const layoutNodePropsSchema: z.ZodType<LayoutNodeProps> = z.strictObject({
  gap: z.number().nonnegative().optional(),
  sizes: z.array(layoutTrackSizeSchema).optional(),
  activeIndex: z.number().int().nonnegative().optional(),
  width: layoutSizeSchema.optional(),
  height: layoutSizeSchema.optional(),
  minWidth: z.number().nonnegative().optional(),
  maxWidth: z.number().nonnegative().optional(),
  resizable: z.boolean().optional(),
});

const mutationLayoutNodeSchema: z.ZodType<AppUILayoutMutationNode> = z.lazy(() =>
  z.union([
    z.strictObject({
      type: z.union([z.literal("row"), z.literal("column")]),
      localRef: z.string().regex(/^\$[A-Za-z][A-Za-z0-9_-]*$/).optional(),
      children: z.array(mutationLayoutNodeSchema),
      gap: z.number().nonnegative().optional(),
      sizes: z.array(layoutTrackSizeSchema).optional(),
    }),
    z.strictObject({
      type: z.literal("stack"),
      localRef: z.string().regex(/^\$[A-Za-z][A-Za-z0-9_-]*$/).optional(),
      children: z.array(mutationLayoutNodeSchema),
      activeIndex: z.number().int().nonnegative().optional(),
    }),
    z.strictObject({
      type: z.literal("panel"),
      localRef: z.string().regex(/^\$[A-Za-z][A-Za-z0-9_-]*$/).optional(),
      child: mutationLayoutNodeSchema,
      width: layoutSizeSchema.optional(),
      height: layoutSizeSchema.optional(),
      minWidth: z.number().nonnegative().optional(),
      maxWidth: z.number().nonnegative().optional(),
      resizable: z.boolean().optional(),
    }),
    z.strictObject({
      type: z.literal("slot"),
      localRef: z.string().regex(/^\$[A-Za-z][A-Za-z0-9_-]*$/).optional(),
      plugins: z.array(appUIPluginNodeSchema),
    }),
  ]),
);

export const appUIPluginTargetSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("application") }),
  z.strictObject({ type: z.literal("layout_slot"), slotRef: layoutRefSchema }),
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
    type: z.literal("insert_plugin_default"),
    plugin: appUIPluginNodeSchema,
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
    reflow: removeReflowSchema.optional(),
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
    parentRef: layoutRefSchema,
    node: mutationLayoutNodeSchema,
    index: indexSchema,
    size: layoutTrackSizeSchema.optional(),
  }),
  z.strictObject({
    type: z.literal("update_layout_node_props"),
    nodeRef: layoutRefSchema,
    set: layoutNodePropsSchema.optional(),
    removeKeys: removeKeysSchema,
  }),
  z.strictObject({
    type: z.literal("move_layout_node"),
    nodeRef: layoutRefSchema,
    newParentRef: layoutRefSchema,
    index: indexSchema,
    size: layoutTrackSizeSchema.optional(),
  }),
  z.strictObject({
    type: z.literal("replace_layout_node"),
    nodeRef: layoutRefSchema,
    node: mutationLayoutNodeSchema,
  }),
  z.strictObject({
    type: z.literal("remove_layout_node"),
    nodeRef: layoutRefSchema,
  }),
  z.strictObject({
    type: z.literal("insert_layout_relative"),
    anchorRef: layoutRefSchema,
    direction: directionSchema,
    node: mutationLayoutNodeSchema,
    size: layoutTrackSizeSchema.optional(),
    anchorSize: layoutTrackSizeSchema.optional(),
  }),
]);

export const appUIOperationsSchema = z.array(appUIOperationSchema).min(1).max(100);
export type AppUIOperation = z.infer<typeof appUIOperationSchema>;
export type AppUIPluginTarget = z.infer<typeof appUIPluginTargetSchema>;

type ChildrenNode = AppUIRowNode | AppUIColumnNode | AppUIStackNode;
type LayoutReflowParent = AppUIRowNode | AppUIColumnNode;

interface MutationContext {
  model: AppUIModel;
  snapshot: ReturnType<typeof buildLayoutRefIndex>;
  localRefs: Map<string, AppUILayoutNode>;
}

interface CurrentNodeEntry {
  node: AppUILayoutNode;
  path: string;
  parent?: AppUILayoutNode | undefined;
  parentKind: "root" | "children" | "panel";
  index?: number | undefined;
}

interface LayoutReflowPlan {
  branch: AppUILayoutNode;
  parent: LayoutReflowParent;
  index: number;
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

function assertLayoutTrackSize(value: unknown): asserts value is string {
  if (!layoutTrackSizeSchema.safeParse(value).success) {
    operationError("LAYOUT_TRACK_SIZE_UNIT_REQUIRED", LAYOUT_TRACK_SIZE_ERROR);
  }
}

function assertLayoutTrackSizes(value: unknown): asserts value is string[] {
  if (!Array.isArray(value) || value.some((entry) => !layoutTrackSizeSchema.safeParse(entry).success)) {
    operationError("LAYOUT_TRACK_SIZE_UNIT_REQUIRED", LAYOUT_TRACK_SIZE_ERROR);
  }
}

function currentEntry(context: MutationContext, target: AppUILayoutNode): CurrentNodeEntry | undefined {
  return walkAppUILayout(context.model.root).find((entry) => entry.node === target);
}

function resolveNode(context: MutationContext, ref: LayoutRef): AppUILayoutNode {
  const node = ref.startsWith("$")
    ? context.localRefs.get(ref)
    : context.snapshot.byRef.get(ref);
  if (node === undefined) {
    operationError("LAYOUT_REF_NOT_FOUND", `Layout ref "${ref}" does not exist in this transaction snapshot.`);
  }
  if (currentEntry(context, node) === undefined) {
    operationError("LAYOUT_REF_DETACHED", `Layout ref "${ref}" is detached after an earlier operation.`);
  }
  return node;
}

function materializeMutationNode(
  input: AppUILayoutMutationNode,
  context: MutationContext,
): AppUILayoutNode {
  const localRef = input.localRef;
  if (localRef !== undefined && context.localRefs.has(localRef)) {
    operationError("DUPLICATE_LAYOUT_LOCAL_REF", `Transaction local ref "${localRef}" is declared more than once.`);
  }

  let node: AppUILayoutNode;
  if (input.type === "row" || input.type === "column") {
    if (input.sizes !== undefined) assertLayoutTrackSizes(input.sizes);
    node = {
      type: input.type,
      children: input.children.map((child) => materializeMutationNode(child, context)),
      ...(input.gap === undefined ? {} : { gap: input.gap }),
      ...(input.sizes === undefined ? {} : { sizes: [...input.sizes] }),
    };
  } else if (input.type === "stack") {
    node = {
      type: "stack",
      children: input.children.map((child) => materializeMutationNode(child, context)),
      ...(input.activeIndex === undefined ? {} : { activeIndex: input.activeIndex }),
    };
  } else if (input.type === "panel") {
    node = {
      type: "panel",
      child: materializeMutationNode(input.child, context),
      ...(input.width === undefined ? {} : { width: input.width }),
      ...(input.height === undefined ? {} : { height: input.height }),
      ...(input.minWidth === undefined ? {} : { minWidth: input.minWidth }),
      ...(input.maxWidth === undefined ? {} : { maxWidth: input.maxWidth }),
      ...(input.resizable === undefined ? {} : { resizable: input.resizable }),
    };
  } else {
    node = { type: "slot", plugins: structuredClone(input.plugins) };
  }
  if (localRef !== undefined) context.localRefs.set(localRef, node);
  return node;
}

function visitMutationLayoutNode(
  node: AppUILayoutMutationNode,
  visit: (node: AppUILayoutMutationNode) => void,
): void {
  visit(node);
  if (node.type === "row" || node.type === "column" || node.type === "stack") {
    node.children.forEach((child) => visitMutationLayoutNode(child, visit));
  } else if (node.type === "panel") {
    visitMutationLayoutNode(node.child, visit);
  }
}

/**
 * Validates transaction-only layout declarations before any operation can
 * mutate the draft. A local ref identifies exactly one newly materialized
 * Layout node across the entire transaction, including nested subtrees.
 */
export function validateLayoutLocalRefs(
  operations: readonly AppUIOperation[],
): void {
  const declared = new Set<string>();
  const collect = (node: AppUILayoutMutationNode): void => {
    if (node.localRef !== undefined) {
      if (declared.has(node.localRef)) {
        operationError(
          "DUPLICATE_LAYOUT_LOCAL_REF",
          `Transaction local ref "${node.localRef}" is declared more than once.`,
        );
      }
      declared.add(node.localRef);
    }
  };

  for (const operation of operations) {
    if (
      operation.type === "insert_layout_node" ||
      operation.type === "replace_layout_node" ||
      operation.type === "insert_layout_relative"
    ) {
      visitMutationLayoutNode(operation.node, collect);
    }
  }
}

function requiredNode(context: MutationContext, ref: LayoutRef): AppUILayoutNode {
  return resolveNode(context, ref);
}

function requiredPluginLocation(model: AppUIModel, instanceId: string): AppUIPluginLocation {
  const location = collectAppUIPluginLocations(model).find(({ plugin }) => plugin.id === instanceId);
  if (location === undefined) operationError("PLUGIN_NOT_FOUND", `Plugin instance "${instanceId}" does not exist.`);
  return location;
}

function insertAt<T>(items: T[], item: T, index: number | undefined, label: string): void {
  const targetIndex = index ?? items.length;
  if (targetIndex > items.length) operationError("INDEX_OUT_OF_RANGE", `${label} index ${targetIndex} exceeds length ${items.length}.`);
  items.splice(targetIndex, 0, item);
}

function pluginContainer(context: MutationContext, target: AppUIPluginTarget): AppUIPluginNode[] {
  if (target.type === "application") {
    context.model.applicationPlugins ??= [];
    return context.model.applicationPlugins;
  }
  if (target.type === "layout_slot") {
    const node = requiredNode(context, target.slotRef);
    if (node.type !== "slot") operationError("LAYOUT_REF_NOT_SLOT", `Layout ref "${target.slotRef}" is not a Slot.`);
    return node.plugins;
  }
  const parent = requiredPluginLocation(context.model, target.parentInstanceId).plugin;
  parent.slots ??= {};
  parent.slots[target.slot] ??= [];
  return parent.slots[target.slot];
}

function pluginContainerForLocation(context: MutationContext, location: AppUIPluginLocation): AppUIPluginNode[] {
  if (location.target.type === "application") {
    context.model.applicationPlugins ??= [];
    return context.model.applicationPlugins;
  }
  if (location.target.type === "layout_slot") return location.target.slotNode.plugins;
  const parent = requiredPluginLocation(context.model, location.target.parentInstanceId).plugin;
  parent.slots ??= {};
  parent.slots[location.target.slot] ??= [];
  return parent.slots[location.target.slot];
}

function detachPlugin(context: MutationContext, instanceId: string): { plugin: AppUIPluginNode; container: AppUIPluginNode[]; index: number } {
  const location = requiredPluginLocation(context.model, instanceId);
  const container = pluginContainerForLocation(context, location);
  const [plugin] = container.splice(location.index, 1);
  if (plugin === undefined) operationError("PLUGIN_NOT_FOUND", `Plugin instance "${instanceId}" does not exist.`);
  return { plugin, container, index: location.index };
}

function planLayoutReflow(
  context: MutationContext,
  location: AppUIPluginLocation,
): LayoutReflowPlan {
  if (location.target.type !== "layout_slot") {
    operationError(
      "LAYOUT_REFLOW_NOT_LAYOUT_REGION",
      "collapse-empty-region only applies to a Plugin that directly occupies a Layout Slot.",
      { target: location.target.type },
    );
  }

  const slot = location.target.slotNode;
  if (slot.plugins.length !== 1 || location.index !== 0) {
    operationError(
      "LAYOUT_REFLOW_REGION_NOT_EMPTY",
      "The Layout Slot contains more than the Plugin being removed; refusing to collapse its region.",
      { slotPath: location.target.slotPath, pluginCount: slot.plugins.length },
    );
  }

  let branch: AppUILayoutNode = slot;
  let entry = currentEntry(context, branch);
  if (entry === undefined) {
    operationError(
      "LAYOUT_REFLOW_UNSAFE",
      "The Plugin's Layout Slot is not attached to the current Layout tree.",
    );
  }

  // A dedicated region may contain a chain of single-child Panel wrappers.
  // Stop at the first real container so sibling content and Stack boundaries
  // remain untouched.
  while (entry.parentKind === "panel" && entry.parent?.type === "panel") {
    branch = entry.parent;
    entry = currentEntry(context, branch);
    if (entry === undefined) {
      operationError(
        "LAYOUT_REFLOW_UNSAFE",
        "The dedicated Layout region is not attached to the current Layout tree.",
      );
    }
  }

  if (
    entry.parentKind !== "children" ||
    entry.parent === undefined ||
    entry.index === undefined
  ) {
    operationError(
      "LAYOUT_REFLOW_UNSUPPORTED_PARENT",
      "The dedicated Layout region must be a child of a Row or Column.",
      { parentKind: entry.parentKind },
    );
  }

  if (entry.parent.type !== "row" && entry.parent.type !== "column") {
    operationError(
      "LAYOUT_REFLOW_UNSUPPORTED_PARENT",
      "Deterministic region collapse does not cross a Stack or another unsupported Layout parent.",
      { parentType: entry.parent.type },
    );
  }

  if (
    entry.parent.children[entry.index] !== branch ||
    (entry.parent.sizes !== undefined &&
      entry.parent.sizes.length !== entry.parent.children.length)
  ) {
    operationError(
      "LAYOUT_REFLOW_UNSAFE",
      "The dedicated Layout region does not have a stable child and track relationship.",
    );
  }

  return { branch, parent: entry.parent, index: entry.index };
}

function applyLayoutReflow(context: MutationContext, plan: LayoutReflowPlan): void {
  const { branch, parent, index } = plan;
  if (parent.children[index] !== branch) {
    operationError(
      "LAYOUT_REFLOW_UNSAFE",
      "The dedicated Layout region changed before reflow could be applied.",
    );
  }

  parent.children.splice(index, 1);
  if (parent.sizes !== undefined) {
    parent.sizes.splice(index, 1);
  }

  // A zero-child Row or Column remains an explicit empty Layout container.
  // There is no remaining content that can safely replace it.
  if (parent.children.length !== 1) return;

  replaceNode(context, parent, parent.children[0]!);
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

function assertUniquePluginIds(model: AppUIModel, plugin: AppUIPluginNode, ignoredIds: ReadonlySet<string> = new Set()): void {
  const existing = new Set(
    collectAppUIPluginLocations(model)
      .map(({ plugin: current }) => current.id)
      .filter((id) => !ignoredIds.has(id)),
  );
  for (const id of pluginSubtreeIds(plugin)) {
    if (existing.has(id)) operationError("PLUGIN_ALREADY_EXISTS", `Plugin instance "${id}" already exists.`);
    existing.add(id);
  }
}

function assertUniqueLayoutPluginIds(
  model: AppUIModel,
  node: AppUILayoutNode,
  ignoredIds: ReadonlySet<string> = new Set(),
): void {
  const existing = new Set(
    collectAppUIPluginLocations(model)
      .map(({ plugin }) => plugin.id)
      .filter((id) => !ignoredIds.has(id)),
  );
  for (const id of subtreePluginIds(node)) {
    if (existing.has(id)) operationError("PLUGIN_ALREADY_EXISTS", `Plugin instance "${id}" already exists.`);
    existing.add(id);
  }
}

function childContainer(node: AppUILayoutNode, operation: string): ChildrenNode {
  if (node.type === "row" || node.type === "column" || node.type === "stack") return node;
  operationError("LAYOUT_PARENT_NOT_CONTAINER", `${operation} requires a row, column, or stack parent; received ${node.type}.`);
}

function insertChild(parent: ChildrenNode, node: AppUILayoutNode, index: number | undefined, size: AppUILayoutSize | undefined): void {
  const targetIndex = index ?? parent.children.length;
  if (targetIndex > parent.children.length) operationError("INDEX_OUT_OF_RANGE", `Layout child index ${targetIndex} exceeds length ${parent.children.length}.`);
  if (parent.type === "row" || parent.type === "column") {
    if (parent.sizes !== undefined) {
      if (size === undefined) operationError("LAYOUT_SIZE_REQUIRED", "The destination container has sizes; the inserted child requires a size.");
      assertLayoutTrackSize(size);
      parent.sizes.splice(targetIndex, 0, size);
    } else if (size !== undefined) {
      operationError("LAYOUT_SIZE_NOT_APPLICABLE", "The destination container does not define sizes.");
    }
  } else if (size !== undefined) {
    operationError("LAYOUT_SIZE_NOT_APPLICABLE", "Stack children do not support sizes.");
  }
  parent.children.splice(targetIndex, 0, node);
}

function detachChild(entry: CurrentNodeEntry): { node: AppUILayoutNode; size?: AppUILayoutSize } {
  if (entry.parentKind !== "children" || entry.parent === undefined || entry.index === undefined) {
    operationError("LAYOUT_NODE_NOT_MOVABLE", "The root or panel child cannot be moved as a layout child.");
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

function replaceNode(context: MutationContext, oldNode: AppUILayoutNode, replacement: AppUILayoutNode): void {
  const entry = currentEntry(context, oldNode);
  if (entry === undefined) operationError("LAYOUT_REF_DETACHED", "The referenced Layout node is detached.");
  assertSubtreeCanDisappear(oldNode, replacement);
  if (entry.parentKind === "root") {
    context.model.root = replacement;
    return;
  }
  if (entry.parent === undefined) operationError("LAYOUT_PARENT_NOT_FOUND", "The Layout parent is missing.");
  if (entry.parentKind === "panel") {
    (entry.parent as AppUIPanelNode).child = replacement;
    return;
  }
  if (entry.index === undefined) operationError("LAYOUT_PARENT_NOT_FOUND", "The Layout child index is missing.");
  childContainer(entry.parent, "replace_layout_node").children[entry.index] = replacement;
}

const layoutPropKeys: Record<AppUILayoutNode["type"], ReadonlySet<string>> = {
  row: new Set(["gap", "sizes"]),
  column: new Set(["gap", "sizes"]),
  stack: new Set(["activeIndex"]),
  panel: new Set(["width", "height", "minWidth", "maxWidth", "resizable"]),
  slot: new Set(),
};

function updateLayoutNodeProps(node: AppUILayoutNode, set?: LayoutNodeProps, removeKeys?: string[]): void {
  if ((node.type === "row" || node.type === "column") && set?.sizes !== undefined) {
    assertLayoutTrackSizes(set.sizes);
  }
  const allowed = layoutPropKeys[node.type];
  for (const key of [...Object.keys(set ?? {}), ...(removeKeys ?? [])]) {
    if (!allowed.has(key)) operationError("LAYOUT_PROP_NOT_MUTABLE", `Property "${key}" cannot be changed on ${node.type} nodes.`, { allowed: [...allowed] });
  }
  const target = node as unknown as Record<string, unknown>;
  Object.assign(target, set ?? {});
  for (const key of removeKeys ?? []) delete target[key];
}

interface StackActiveState {
  node: AppUIStackNode;
  activeChild: AppUILayoutNode | undefined;
  oldIndex: number | undefined;
}

function captureStackActiveStates(model: AppUIModel): StackActiveState[] {
  return walkAppUILayout(model.root)
    .map(({ node }) => node)
    .filter((node): node is AppUIStackNode => node.type === "stack")
    .map((node) => ({
      node,
      activeChild: node.activeIndex === undefined ? undefined : node.children[node.activeIndex],
      oldIndex: node.activeIndex,
    }));
}

function restoreStackActiveStates(model: AppUIModel, states: readonly StackActiveState[]): void {
  for (const state of states) {
    if (currentEntry({ model, snapshot: buildLayoutRefIndex(model.root), localRefs: new Map() }, state.node) === undefined) continue;
    if (state.node.children.length === 0) {
      delete state.node.activeIndex;
      continue;
    }
    if (state.activeChild === undefined && state.oldIndex === undefined) {
      delete state.node.activeIndex;
      continue;
    }
    const activeIndex = state.activeChild === undefined
      ? Math.min(state.oldIndex ?? 0, state.node.children.length - 1)
      : state.node.children.indexOf(state.activeChild);
    state.node.activeIndex = activeIndex >= 0
      ? activeIndex
      : Math.min(state.oldIndex ?? 0, state.node.children.length - 1);
  }
}

function insertRelative(context: MutationContext, operation: Extract<AppUIOperation, { type: "insert_layout_relative" }>): void {
  const anchor = requiredNode(context, operation.anchorRef);
  const entry = currentEntry(context, anchor);
  if (entry === undefined) operationError("LAYOUT_REF_DETACHED", `Layout ref "${operation.anchorRef}" is detached.`);
  const node = materializeMutationNode(operation.node, context);
  assertUniqueLayoutPluginIds(context.model, node);
  const horizontal = operation.direction === "left" || operation.direction === "right";
  const axis = horizontal ? "row" : "column";
  const before = operation.direction === "left" || operation.direction === "above";
  const parent = entry.parent;
  const matchingParent = parent !== undefined && parent.type === axis ? parent : undefined;
  if (matchingParent !== undefined && entry.index !== undefined) {
    if (operation.anchorSize !== undefined) {
      if (matchingParent.sizes === undefined) operationError("LAYOUT_SIZE_NOT_APPLICABLE", "anchorSize requires a sized Row or Column.");
      assertLayoutTrackSize(operation.anchorSize);
      matchingParent.sizes[entry.index] = operation.anchorSize;
    }
    insertChild(matchingParent, node, before ? entry.index : entry.index + 1, operation.size);
    return;
  }

  if ((operation.size === undefined) !== (operation.anchorSize === undefined)) {
    operationError("LAYOUT_SIZES_INCOMPLETE", "A new wrapper requires both size and anchorSize when either is provided.");
  }
  if (operation.size !== undefined) assertLayoutTrackSize(operation.size);
  if (operation.anchorSize !== undefined) assertLayoutTrackSize(operation.anchorSize);
  const wrapper: AppUIRowNode | AppUIColumnNode = {
    type: axis,
    children: before ? [node, anchor] : [anchor, node],
    ...(
      operation.size === undefined
        ? {}
        : { sizes: before ? [operation.size, operation.anchorSize!] : [operation.anchorSize!, operation.size] }
    ),
  };
  replaceNode(context, anchor, wrapper);
}

function applyOperation(context: MutationContext, operation: AppUIOperation): void {
  switch (operation.type) {
    case "insert_plugin":
      assertUniquePluginIds(context.model, operation.plugin);
      insertAt(pluginContainer(context, operation.target), structuredClone(operation.plugin), operation.index, "Plugin target");
      return;
    case "insert_plugin_default":
      operationError(
        "SEMANTIC_OPERATION_NOT_LOWERED",
        "insert_plugin_default must be lowered by the AppUI transaction Host before applying operations.",
      );
    case "move_plugin": {
      const detached = detachPlugin(context, operation.instanceId);
      const destination = pluginContainer(context, operation.target);
      const adjustedIndex = operation.index !== undefined && detached.container === destination && detached.index < operation.index
        ? operation.index - 1
        : operation.index;
      insertAt(destination, detached.plugin, adjustedIndex, "Plugin target");
      return;
    }
    case "remove_plugin": {
      const location = requiredPluginLocation(context.model, operation.instanceId);
      const reflowPlan = operation.reflow === "collapse-empty-region"
        ? planLayoutReflow(context, location)
        : undefined;
      detachPlugin(context, operation.instanceId);
      if (reflowPlan !== undefined) {
        applyLayoutReflow(context, reflowPlan);
      }
      return;
    }
    case "replace_plugin": {
      const location = requiredPluginLocation(context.model, operation.instanceId);
      assertUniquePluginIds(context.model, operation.replacement, pluginSubtreeIds(location.plugin));
      pluginContainerForLocation(context, location)[location.index] = structuredClone(operation.replacement);
      return;
    }
    case "update_plugin_props": {
      const plugin = requiredPluginLocation(context.model, operation.instanceId).plugin;
      const props = { ...(plugin.props ?? {}) };
      Object.assign(props, operation.set ?? {});
      for (const key of operation.removeKeys ?? []) delete props[key];
      if (Object.keys(props).length === 0) delete plugin.props;
      else plugin.props = props;
      return;
    }
    case "set_plugin_enabled":
      requiredPluginLocation(context.model, operation.instanceId).plugin.enabled = operation.enabled;
      return;
    case "insert_layout_node": {
      const parent = childContainer(requiredNode(context, operation.parentRef), operation.type);
      const node = materializeMutationNode(operation.node, context);
      assertUniqueLayoutPluginIds(context.model, node);
      insertChild(parent, node, operation.index, operation.size);
      return;
    }
    case "update_layout_node_props":
      updateLayoutNodeProps(requiredNode(context, operation.nodeRef), operation.set, operation.removeKeys);
      return;
    case "move_layout_node": {
      const node = requiredNode(context, operation.nodeRef);
      if (currentEntry(context, node)?.parentKind === "root") operationError("LAYOUT_ROOT_NOT_MOVABLE", "The Layout root cannot be moved.");
      const destination = childContainer(requiredNode(context, operation.newParentRef), operation.type);
      if (destination === node || walkAppUILayout(node).some(({ node: descendant }) => descendant === destination)) operationError("LAYOUT_MOVE_CYCLE", "Cannot move a Layout node into its own subtree.");
      const detached = detachChild(currentEntry(context, node)!);
      insertChild(destination, detached.node, operation.index, operation.size ?? detached.size);
      return;
    }
    case "replace_layout_node": {
      const oldNode = requiredNode(context, operation.nodeRef);
      const replacement = materializeMutationNode(operation.node, context);
      assertUniqueLayoutPluginIds(context.model, replacement, new Set(subtreePluginIds(oldNode)));
      replaceNode(context, oldNode, replacement);
      return;
    }
    case "remove_layout_node": {
      const node = requiredNode(context, operation.nodeRef);
      if (currentEntry(context, node)?.parentKind === "root") operationError("LAYOUT_ROOT_NOT_REMOVABLE", "The Layout root cannot be removed.");
      assertSubtreeCanDisappear(node);
      detachChild(currentEntry(context, node)!);
      return;
    }
    case "insert_layout_relative":
      insertRelative(context, operation);
      return;
  }
}

export function applyAppUIOperations(source: AppUIModel, operations: readonly AppUIOperation[]): AppUIModel {
  const model = structuredClone(source);
  validateLayoutLocalRefs(operations);
  const context: MutationContext = {
    model,
    snapshot: buildLayoutRefIndex(model.root),
    localRefs: new Map(),
  };
  for (const operation of operations) {
    const preserveStackActive = operation.type === "insert_layout_node" ||
      operation.type === "move_layout_node" ||
      operation.type === "replace_layout_node" ||
      operation.type === "remove_layout_node" ||
      operation.type === "insert_layout_relative";
    const states = preserveStackActive ? captureStackActiveStates(model) : [];
    applyOperation(context, operation);
    if (preserveStackActive) restoreStackActiveStates(model, states);
  }
  return model;
}
