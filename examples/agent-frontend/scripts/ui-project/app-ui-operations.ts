import { z } from "zod";

import {
  appUIPluginNodeSchema,
  buildLayoutRefIndex,
  collectAppUIPluginLocations,
  panelDimensionSchema,
  walkAppUILayout,
  type AppUIColumnNode,
  type AppUILayoutNode,
  type AppUILayoutTrackSize,
  type AppUIPanelDimension,
  type AppUIModel,
  type AppUIPanelNode,
  type AppUIPluginLocation,
  type AppUIPluginNode,
  type AppUIRowNode,
  type AppUIStackNode,
  type LayoutRef,
} from "../../framework/contracts/app-ui-model";
import {
  WORKSPACE_REGIONS,
  type AgentUIWorkspacePolicy,
  type WorkspaceRegion,
  type WorkspaceTopology,
} from "../../framework/contracts/agent-ui-workspace";
import type { PluginChildSlotDefinition, PluginSlotCatalog } from "../../framework/contracts/app-ui-composition";
import {
  projectWorkspaceTopology,
} from "./workspace-topology";

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
const pluginMovePlacementSchema = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("relative"),
    anchorInstanceId: nonBlankStringSchema,
    relation: z.enum(["before", "after"]),
  }),
  z.strictObject({
    type: z.literal("plugin_slot"),
    parentInstanceId: nonBlankStringSchema,
    slot: nonBlankStringSchema,
  }),
]);

type AppUILayoutMutationNode =
  | ({ type: "row" | "column"; children: AppUILayoutMutationNode[]; gap?: number; sizes?: string[] } & { localRef?: string })
  | ({ type: "stack"; children: AppUILayoutMutationNode[]; activeIndex?: number } & { localRef?: string })
  | ({ type: "panel"; child: AppUILayoutMutationNode; width?: AppUIPanelDimension; height?: AppUIPanelDimension; minWidth?: number; maxWidth?: number; resizable?: boolean } & { localRef?: string })
  | ({ type: "slot"; plugins: AppUIPluginNode[] } & { localRef?: string });

type LayoutNodeProps = {
  gap?: number;
  sizes?: string[];
  activeIndex?: number;
  width?: AppUIPanelDimension;
  height?: AppUIPanelDimension;
  minWidth?: number;
  maxWidth?: number;
  resizable?: boolean;
};

const layoutNodePropsSchema: z.ZodType<LayoutNodeProps> = z.strictObject({
  gap: z.number().nonnegative().optional(),
  sizes: z.array(layoutTrackSizeSchema).optional(),
  activeIndex: z.number().int().nonnegative().optional(),
  width: panelDimensionSchema.optional(),
  height: panelDimensionSchema.optional(),
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
      width: panelDimensionSchema.optional(),
      height: panelDimensionSchema.optional(),
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
    type: z.literal("execute_creator_action"),
    actionId: nonBlankStringSchema,
  }),
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
    type: z.literal("remove_plugin_default"),
    instanceId: nonBlankStringSchema,
  }),
  z.strictObject({
    type: z.literal("move_plugin"),
    instanceId: nonBlankStringSchema,
    target: appUIPluginTargetSchema,
    index: indexSchema,
  }),
  z.strictObject({
    type: z.literal("move_plugin_to"),
    instanceId: nonBlankStringSchema,
    placement: pluginMovePlacementSchema,
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
export type AppUIPluginMoveOperation = Extract<AppUIOperation, { type: "move_plugin_to" }>;
export type AppUIPluginMovePlacement = AppUIPluginMoveOperation["placement"];

/**
 * Host-only binding for a semantic Workspace Region Action. This is lowered
 * to generic Layout operations before the public AppUI mutation protocol is
 * applied.
 */
export interface CreatorWorkspaceRegionMoveBinding {
  readonly type: "workspace_region_move";
  readonly instanceId: string;
  readonly region: WorkspaceRegion;
}

type ChildrenNode = AppUIRowNode | AppUIColumnNode | AppUIStackNode;
export type LayoutReflowParent = AppUIRowNode | AppUIColumnNode;

interface MutationContext {
  model: AppUIModel;
  snapshot: ReturnType<typeof buildLayoutRefIndex>;
  localRefs: Map<string, AppUILayoutNode>;
  pluginMoveContracts?: AppUIPluginMoveContracts | undefined;
  workspacePolicy?: AgentUIWorkspacePolicy | undefined;
}

interface CurrentNodeEntry {
  node: AppUILayoutNode;
  path: string;
  parent?: AppUILayoutNode | undefined;
  parentKind: "root" | "children" | "panel";
  index?: number | undefined;
}

export interface LayoutReflowPlan {
  branch: AppUILayoutNode;
  parent: LayoutReflowParent;
  index: number;
}

export interface AppUIPluginMoveContracts {
  readonly pluginCapabilities: ReadonlyMap<string, readonly string[]>;
  readonly pluginSlots: PluginSlotCatalog;
}

export type PluginMoveSource =
  | "plugin_slot"
  | "shared_layout_slot"
  | "dedicated_layout_region";

export interface RelativePluginMovePlan {
  type: "relative";
  changed: boolean;
  instanceId: string;
  anchorInstanceId: string;
  relation: "before" | "after";
  branch: AppUILayoutNode;
  parent: AppUIRowNode;
  branchRef: string;
  parentRef: string;
  sourceIndex: number;
  anchorIndex: number;
  insertionIndex: number;
}

export interface PluginSlotMovePlan {
  type: "plugin_slot";
  changed: boolean;
  instanceId: string;
  parentInstanceId: string;
  slot: string;
  source: PluginMoveSource;
  sourceReflow?: LayoutReflowPlan | undefined;
}

export interface WorkspaceRegionExpectedPlacement {
  type: "relative";
  instanceId: string;
  anchorInstanceId: string;
  relation: "before" | "after";
}

export interface WorkspaceRegionMovePlan {
  type: "workspace_region";
  changed: boolean;
  instanceId: string;
  sourceRegion: WorkspaceRegion;
  destinationRegion: WorkspaceRegion;
  branch: AppUILayoutNode;
  parent: AppUIRowNode;
  branchRef: string;
  parentRef: string;
  sourceIndex: number;
  insertionIndex: number;
  destinationTrack: string;
  legacyWidthRefs?: string[] | undefined;
  expectedPlacement?: WorkspaceRegionExpectedPlacement | undefined;
}

export type PluginMovePlan =
  | RelativePluginMovePlan
  | PluginSlotMovePlan;

export type DefaultPluginRemovalReflow =
  | "collapsed-dedicated-region"
  | "preserved-container";

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

interface DedicatedLayoutRegion {
  slot: Extract<AppUILayoutNode, { type: "slot" }>;
  branch: AppUILayoutNode;
  entry: CurrentNodeEntry;
}

function resolveDedicatedLayoutRegion(
  context: MutationContext,
  location: AppUIPluginLocation,
): DedicatedLayoutRegion {
  if (location.target.type !== "layout_slot") {
    operationError(
      "LAYOUT_REFLOW_NOT_LAYOUT_REGION",
      "The Plugin must directly occupy a Layout Slot to resolve a dedicated visual region.",
      { target: location.target.type },
    );
  }

  const slot = location.target.slotNode;
  if (slot.plugins.length !== 1 || location.index !== 0) {
    operationError(
      "LAYOUT_REFLOW_REGION_NOT_EMPTY",
      "The Layout Slot contains more than the Plugin being moved or removed; refusing to collapse its region.",
      { target: location.target.slotPath, pluginCount: slot.plugins.length },
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

  return { slot, branch, entry };
}

function planLayoutReflow(
  context: MutationContext,
  location: AppUIPluginLocation,
): LayoutReflowPlan {
  const { branch, entry } = resolveDedicatedLayoutRegion(context, location);

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

/**
 * Productized removal has a safe default: collapse a dedicated visual region
 * when its relationship is provably stable, otherwise preserve the Layout
 * container and remove only the Plugin instance.
 */
function tryPlanDefaultLayoutReflow(
  context: MutationContext,
  location: AppUIPluginLocation,
): LayoutReflowPlan | undefined {
  if (location.target.type !== "layout_slot") return undefined;

  const slot = location.target.slotNode;
  if (slot.plugins.length !== 1 || location.index !== 0) return undefined;

  const { branch, entry } = resolveDedicatedLayoutRegion(context, location);

  if (
    entry.parentKind !== "children" ||
    entry.parent === undefined ||
    entry.index === undefined ||
    (entry.parent.type !== "row" && entry.parent.type !== "column")
  ) {
    return undefined;
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

export function resolveDefaultPluginRemovalReflow(
  source: AppUIModel,
  instanceId: string,
  workspacePolicy?: AgentUIWorkspacePolicy,
): DefaultPluginRemovalReflow {
  const model = structuredClone(source);
  const context: MutationContext = {
    model,
    snapshot: buildLayoutRefIndex(model.root),
    localRefs: new Map(),
    ...(workspacePolicy === undefined ? {} : { workspacePolicy }),
  };
  const location = requiredPluginLocation(model, instanceId);
  const plan = tryPlanDefaultLayoutReflow(context, location);
  return plan === undefined || (
    isWorkspaceRoot(context, plan.parent) &&
    plan.parent.children.length === 2
  )
    ? "preserved-container"
    : "collapsed-dedicated-region";
}

function isWorkspaceRoot(
  context: MutationContext,
  parent: LayoutReflowParent,
): parent is AppUIRowNode {
  return (
    context.workspacePolicy !== undefined &&
    context.model.root === parent &&
    parent.type === "row"
  );
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

  if (isWorkspaceRoot(context, parent)) {
    for (const remaining of parent.children) {
      if (remaining.type === "panel") delete remaining.width;
    }
  }

  // A zero-child Row or Column remains an explicit empty Layout container.
  // There is no remaining content that can safely replace it.
  if (parent.children.length !== 1) return;

  // The Mode Workspace root is a semantic container. Preserve its canonical
  // Row shape when an optional Region disappears, even when only Center
  // remains occupied.
  if (isWorkspaceRoot(context, parent)) return;

  replaceNode(context, parent, parent.children[0]!);
}

type PluginMoveErrorCode =
  | "AUTHORING_MOVE_UNSUPPORTED"
  | "AUTHORING_MOVE_INCOMPATIBLE";

function pluginMoveError(
  code: PluginMoveErrorCode,
  message: string,
  details?: unknown,
): never {
  operationError(code, message, details);
}

function moveUnsupported(
  reason: string,
  message: string,
  details?: Record<string, unknown>,
): never {
  pluginMoveError("AUTHORING_MOVE_UNSUPPORTED", message, { reason, ...details });
}

function moveIncompatible(
  reason: string,
  message: string,
  details?: Record<string, unknown>,
): never {
  pluginMoveError("AUTHORING_MOVE_INCOMPATIBLE", message, { reason, ...details });
}

export interface PluginMoveVisualRegion {
  branch: AppUILayoutNode;
  parent: AppUIRowNode;
  branchRef: string;
  parentRef: string;
  index: number;
}

function resolveMoveVisualRegion(
  context: MutationContext,
  location: AppUIPluginLocation,
  role: "target" | "anchor",
  instanceId: string,
): PluginMoveVisualRegion {
  if (location.target.type !== "layout_slot") {
    moveUnsupported(
      location.target.type === "plugin_slot" ? "plugin-local-slot" : "application-plugin",
      `${role} Plugin instance "${instanceId}" does not directly occupy a Layout Slot.`,
      { instanceId, role, target: location.target.type },
    );
  }

  const slot = location.target.slotNode;
  if (slot.plugins.length !== 1 || location.index !== 0) {
    moveUnsupported(
      "shared-layout-slot",
      `${role} Plugin instance "${instanceId}" occupies a shared Layout Slot.`,
      { instanceId, role, slotPath: location.target.slotPath, pluginCount: slot.plugins.length },
    );
  }

  const region = resolveDedicatedLayoutRegion(context, location);
  const { branch, entry } = region;
  if (
    entry.parentKind !== "children" ||
    entry.parent === undefined ||
    entry.index === undefined
  ) {
    moveUnsupported(
      "unsupported-topology",
      `${role} visual region for Plugin instance "${instanceId}" is not a direct Row child.`,
      { instanceId, role, parentKind: entry.parentKind },
    );
  }
  if (entry.parent.type !== "row") {
    moveUnsupported(
      entry.parent.type === "column" ? "column" : "stack",
      `${role} visual region for Plugin instance "${instanceId}" must be a direct child of a Row.`,
      { instanceId, role, parentType: entry.parent.type },
    );
  }
  if (
    entry.parent.children[entry.index] !== branch ||
    (entry.parent.sizes !== undefined &&
      entry.parent.sizes.length !== entry.parent.children.length)
  ) {
    moveUnsupported(
      "invalid-row-sizes",
      `${role} visual region for Plugin instance "${instanceId}" does not have a stable Row track relationship.`,
      { instanceId, role },
    );
  }

  const branchRef = context.snapshot.byNode.get(branch);
  const parentRef = context.snapshot.byNode.get(entry.parent);
  if (branchRef === undefined || parentRef === undefined) {
    moveUnsupported(
      "detached-region",
      `${role} visual region for Plugin instance "${instanceId}" has no stable Layout reference.`,
      { instanceId, role },
    );
  }

  return {
    branch,
    parent: entry.parent,
    branchRef,
    parentRef,
    index: entry.index,
  };
}

/**
 * Resolve the stable visual Row region used by Host-owned semantic moves.
 * Action Catalog generation uses the same topology checks as move execution
 * when it enumerates Workspace Region and relative candidates.
 */
export function resolvePluginMoveVisualRegion(
  source: AppUIModel,
  instanceId: string,
): PluginMoveVisualRegion {
  const location = collectAppUIPluginLocations(source).find(
    ({ plugin }) => plugin.id === instanceId,
  );
  if (location === undefined) {
    moveUnsupported(
      "target-not-found",
      `Plugin instance "${instanceId}" does not exist.`,
      { instanceId },
    );
  }
  const context: MutationContext = {
    model: source,
    snapshot: buildLayoutRefIndex(source.root),
    localRefs: new Map(),
  };
  return resolveMoveVisualRegion(context, location, "target", instanceId);
}

function workspaceBranchInstanceId(
  context: MutationContext,
  topology: WorkspaceTopology,
  branch: AppUILayoutNode,
): string | undefined {
  for (const location of collectAppUIPluginLocations(context.model)) {
    if (location.target.type !== "layout_slot") continue;
    try {
      const region = resolveMoveVisualRegion(
        context,
        location,
        "workspace anchor",
        location.plugin.id,
      );
      if (region.parent === topology.root && region.branch === branch) {
        return location.plugin.id;
      }
    } catch (error) {
      if (error instanceof AppUIOperationError && error.code === "AUTHORING_MOVE_UNSUPPORTED") {
        continue;
      }
      throw error;
    }
  }
  return undefined;
}

function planWorkspaceRegionMoveInContext(
  context: MutationContext,
  operation: CreatorWorkspaceRegionMoveBinding,
  workspacePolicy: AgentUIWorkspacePolicy,
): WorkspaceRegionMovePlan {
  const topology = projectWorkspaceTopology(context.model, workspacePolicy);
  const targetLocation = collectAppUIPluginLocations(context.model).find(
    ({ plugin }) => plugin.id === operation.instanceId,
  );
  if (targetLocation === undefined) {
    moveUnsupported(
      "target-not-found",
      `Plugin instance "${operation.instanceId}" does not exist.`,
      { instanceId: operation.instanceId },
    );
  }

  const targetRegion = resolveMoveVisualRegion(
    context,
    targetLocation,
    "target",
    operation.instanceId,
  );
  if (targetRegion.parent !== topology.root) {
    moveUnsupported(
      "not-workspace-root-child",
      `Plugin instance "${operation.instanceId}" does not occupy a direct Workspace Region.`,
      { instanceId: operation.instanceId },
    );
  }
  if (targetRegion.branch.type !== "panel") {
    moveUnsupported(
      "non-panel-workspace-region",
      `Workspace Region Plugin instance "${operation.instanceId}" must occupy a Panel branch.`,
      { instanceId: operation.instanceId, branchType: targetRegion.branch.type },
    );
  }

  const sourceEntry = WORKSPACE_REGIONS.flatMap((region) => {
    const occupancy = topology.regions[region];
    return occupancy?.branch === targetRegion.branch ? [{ region, occupancy }] : [];
  })[0];
  if (sourceEntry === undefined) {
    moveUnsupported(
      "source-region-unresolved",
      `Plugin instance "${operation.instanceId}" does not resolve to a Workspace Region.`,
      { instanceId: operation.instanceId },
    );
  }

  const destinationRegion = operation.region;
  const destinationPolicy = workspacePolicy.regions[destinationRegion];
  if (destinationPolicy === undefined) {
    moveUnsupported(
      "destination-region-unavailable",
      `Workspace Region "${destinationRegion}" is not available in the current Mode.`,
      { destinationRegion },
    );
  }
  if (typeof destinationPolicy.track !== "string") {
    moveUnsupported(
      "workspace-track-size-not-explicit",
      `Workspace Region "${destinationRegion}" must declare an explicit CSS track size for Host lowering.`,
      { destinationRegion, track: destinationPolicy.track },
    );
  }

  if (sourceEntry.region === destinationRegion) {
    return {
      type: "workspace_region",
      changed: false,
      instanceId: operation.instanceId,
      sourceRegion: sourceEntry.region,
      destinationRegion,
      branch: targetRegion.branch,
      parent: topology.root,
      branchRef: targetRegion.branchRef,
      parentRef: topology.rootRef,
      sourceIndex: sourceEntry.occupancy.index,
      insertionIndex: sourceEntry.occupancy.index,
      destinationTrack: destinationPolicy.track,
    };
  }

  const sourcePolicy = workspacePolicy.regions[sourceEntry.region];
  if (sourcePolicy?.required === true) {
    moveIncompatible(
      "required-region",
      `Plugin instance "${operation.instanceId}" is the required occupant of Workspace Region "${sourceEntry.region}".`,
      { instanceId: operation.instanceId, sourceRegion: sourceEntry.region },
    );
  }

  if (topology.regions[destinationRegion] !== undefined) {
    moveIncompatible(
      "destination-region-occupied",
      `Workspace Region "${destinationRegion}" is already occupied.`,
      { destinationRegion },
    );
  }

  const remaining = WORKSPACE_REGIONS.flatMap((region) => {
    const occupancy = topology.regions[region];
    return occupancy?.branch === targetRegion.branch ? [] : occupancy === undefined
      ? []
      : [occupancy];
  }).sort((left, right) => left.index - right.index);
  const destinationOrder = WORKSPACE_REGIONS.indexOf(destinationRegion);
  const insertionIndex = remaining.findIndex(
    (occupancy) => WORKSPACE_REGIONS.indexOf(occupancy.region) > destinationOrder,
  );
  const resolvedInsertionIndex = insertionIndex === -1
    ? remaining.length
    : insertionIndex;
  const anchor = resolvedInsertionIndex === 0
    ? remaining[0]
    : remaining[resolvedInsertionIndex - 1];
  const anchorInstanceId = anchor === undefined
    ? undefined
    : workspaceBranchInstanceId(context, topology, anchor.branch);

  return {
    type: "workspace_region",
    changed: true,
    instanceId: operation.instanceId,
    sourceRegion: sourceEntry.region,
    destinationRegion,
    branch: targetRegion.branch,
    parent: topology.root,
    branchRef: targetRegion.branchRef,
    parentRef: topology.rootRef,
    sourceIndex: sourceEntry.occupancy.index,
    insertionIndex: resolvedInsertionIndex,
    destinationTrack: destinationPolicy.track,
    legacyWidthRefs: topology.root.children.flatMap((child) => {
      const ref = context.snapshot.byNode.get(child);
      return child.type === "panel" && child.width !== undefined && ref !== undefined
        ? [ref]
        : [];
    }),
    ...(anchorInstanceId === undefined
      ? {}
      : {
          expectedPlacement: {
            type: "relative" as const,
            instanceId: operation.instanceId,
            anchorInstanceId,
            relation: resolvedInsertionIndex === 0 ? "before" as const : "after" as const,
          },
        }),
  };
}

export function planWorkspaceRegionMove(
  source: AppUIModel,
  operation: CreatorWorkspaceRegionMoveBinding,
  workspacePolicy: AgentUIWorkspacePolicy,
): WorkspaceRegionMovePlan {
  const context: MutationContext = {
    model: source,
    snapshot: buildLayoutRefIndex(source.root),
    localRefs: new Map(),
    workspacePolicy,
  };
  return planWorkspaceRegionMoveInContext(context, operation, workspacePolicy);
}

/**
 * Lower a Host-only Workspace Region plan into the generic Layout IR already
 * accepted by the public AppUIModel mutation protocol.
 */
export function lowerWorkspaceRegionMovePlan(
  plan: WorkspaceRegionMovePlan,
): AppUIOperation[] {
  if (!plan.changed) return [];
  if (plan.branch.type !== "panel") {
    operationError(
      "AUTHORING_MOVE_UNSUPPORTED",
      `Workspace Region Plugin instance "${plan.instanceId}" must occupy a Panel branch.`,
      { instanceId: plan.instanceId, branchType: plan.branch.type },
    );
  }
  return [
    {
      type: "move_layout_node",
      nodeRef: plan.branchRef,
      newParentRef: plan.parentRef,
      index: plan.insertionIndex,
      size: plan.destinationTrack,
    },
    ...(plan.legacyWidthRefs ?? (plan.branch.width === undefined ? [] : [plan.branchRef])).map((nodeRef) => ({
      type: "update_layout_node_props" as const,
      nodeRef,
      removeKeys: ["width"],
    })),
  ];
}

export function relativeInsertionIndex(
  sourceIndex: number,
  anchorIndex: number,
  relation: "before" | "after",
): number {
  if (sourceIndex === anchorIndex) {
    moveIncompatible(
      "self-anchor",
      "A Plugin instance cannot be moved relative to itself.",
      { sourceIndex, anchorIndex, relation },
    );
  }
  const postDetachAnchorIndex = anchorIndex - (sourceIndex < anchorIndex ? 1 : 0);
  return relation === "before"
    ? postDetachAnchorIndex
    : postDetachAnchorIndex + 1;
}

function sourceReflowForPluginMove(
  context: MutationContext,
  location: AppUIPluginLocation,
): { source: PluginMoveSource; sourceReflow?: LayoutReflowPlan | undefined } {
  if (location.target.type === "application") {
    moveUnsupported(
      "application-plugin-source",
      `Application Plugin instance "${location.plugin.id}" cannot be moved into a Plugin Slot.`,
      { instanceId: location.plugin.id, source: location.target.type },
    );
  }
  if (location.target.type === "plugin_slot") {
    return { source: "plugin_slot" };
  }
  if (location.target.slotNode.plugins.length !== 1 || location.index !== 0) {
    return { source: "shared_layout_slot" };
  }
  try {
    const sourceReflow = planLayoutReflow(context, location);
    if (sourceReflow.parent.children.length <= 1) {
      moveUnsupported(
        "dedicated-source-cannot-collapse",
        `The dedicated source region for Plugin instance "${location.plugin.id}" would become an empty Row or Column.`,
        { instanceId: location.plugin.id },
      );
    }
    return {
      source: "dedicated_layout_region",
      sourceReflow,
    };
  } catch (error) {
    if (error instanceof AppUIOperationError) {
      moveUnsupported(
        "dedicated-source-cannot-collapse",
        `The dedicated source region for Plugin instance "${location.plugin.id}" cannot be safely collapsed.`,
        { instanceId: location.plugin.id, cause: error.code },
      );
    }
    throw error;
  }
}

export function planPluginMove(
  source: AppUIModel,
  operation: AppUIPluginMoveOperation,
  contracts?: AppUIPluginMoveContracts,
): PluginMovePlan {
  const context: MutationContext = {
    model: source,
    snapshot: buildLayoutRefIndex(source.root),
    localRefs: new Map(),
    ...(contracts === undefined ? {} : { pluginMoveContracts: contracts }),
  };

  const targetLocation = collectAppUIPluginLocations(source).find(
    ({ plugin }) => plugin.id === operation.instanceId,
  );
  if (targetLocation === undefined) {
    moveUnsupported(
      "target-not-found",
      `Plugin instance "${operation.instanceId}" does not exist.`,
      { instanceId: operation.instanceId },
    );
  }

  if (operation.placement.type === "relative") {
    if (operation.instanceId === operation.placement.anchorInstanceId) {
      moveIncompatible(
        "self-anchor",
        `Plugin instance "${operation.instanceId}" cannot be moved relative to itself.`,
        { instanceId: operation.instanceId },
      );
    }
    const anchorLocation = collectAppUIPluginLocations(source).find(
      ({ plugin }) => plugin.id === operation.placement.anchorInstanceId,
    );
    if (anchorLocation === undefined) {
      moveUnsupported(
        "anchor-not-found",
        `Anchor Plugin instance "${operation.placement.anchorInstanceId}" does not exist.`,
        { anchorInstanceId: operation.placement.anchorInstanceId },
      );
    }
    const targetRegion = resolveMoveVisualRegion(
      context,
      targetLocation,
      "target",
      operation.instanceId,
    );
    const anchorRegion = resolveMoveVisualRegion(
      context,
      anchorLocation,
      "anchor",
      operation.placement.anchorInstanceId,
    );
    if (targetRegion.parent !== anchorRegion.parent) {
      moveUnsupported(
        "different-row",
        "Relative Plugin moves require the target and anchor visual regions to share the same direct Row parent.",
        {
          instanceId: operation.instanceId,
          anchorInstanceId: operation.placement.anchorInstanceId,
        },
      );
    }
    const insertionIndex = relativeInsertionIndex(
      targetRegion.index,
      anchorRegion.index,
      operation.placement.relation,
    );
    const alreadySatisfied = operation.placement.relation === "before"
      ? targetRegion.index === anchorRegion.index - 1
      : targetRegion.index === anchorRegion.index + 1;
    return {
      type: "relative",
      changed: !alreadySatisfied,
      instanceId: operation.instanceId,
      anchorInstanceId: operation.placement.anchorInstanceId,
      relation: operation.placement.relation,
      branch: targetRegion.branch,
      parent: targetRegion.parent,
      branchRef: targetRegion.branchRef,
      parentRef: targetRegion.parentRef,
      sourceIndex: targetRegion.index,
      anchorIndex: anchorRegion.index,
      insertionIndex,
    };
  }

  const parentLocation = collectAppUIPluginLocations(source).find(
    ({ plugin }) => plugin.id === operation.placement.parentInstanceId,
  );
  if (parentLocation === undefined) {
    moveUnsupported(
      "destination-parent-not-found",
      `Destination parent Plugin instance "${operation.placement.parentInstanceId}" does not exist.`,
      { parentInstanceId: operation.placement.parentInstanceId },
    );
  }
  if (contracts === undefined) {
    moveUnsupported(
      "destination-contract-unavailable",
      "Plugin Slot moves require the Host-resolved Plugin manifest contract.",
      { parentInstanceId: operation.placement.parentInstanceId, slot: operation.placement.slot },
    );
  }
  const destinationSlots = contracts.pluginSlots[parentLocation.plugin.pluginId];
  const destinationSlot = destinationSlots?.[operation.placement.slot] as PluginChildSlotDefinition | undefined;
  if (destinationSlot === undefined) {
    moveUnsupported(
      "slot-not-declared",
      `Plugin instance "${parentLocation.plugin.id}" does not declare child Slot "${operation.placement.slot}".`,
      {
        parentInstanceId: parentLocation.plugin.id,
        parentPluginId: parentLocation.plugin.pluginId,
        slot: operation.placement.slot,
      },
    );
  }

  const targetSubtree = pluginSubtreeIds(targetLocation.plugin);
  if (targetSubtree.has(parentLocation.plugin.id)) {
    moveIncompatible(
      "cycle",
      `Cannot move Plugin instance "${operation.instanceId}" into its own Plugin subtree.`,
      {
        instanceId: operation.instanceId,
        parentInstanceId: parentLocation.plugin.id,
        slot: operation.placement.slot,
      },
    );
  }

  if (destinationSlot.accepts === undefined) {
    moveUnsupported(
      "slot-accepts-not-declared",
      `Destination child Slot "${operation.placement.slot}" does not declare explicit accepted capabilities.`,
      { parentInstanceId: parentLocation.plugin.id, slot: operation.placement.slot },
    );
  }
  const targetCapabilities = contracts.pluginCapabilities.get(targetLocation.plugin.pluginId);
  if (targetCapabilities === undefined) {
    moveUnsupported(
      "target-capabilities-unavailable",
      `The Host cannot resolve capabilities for Plugin "${targetLocation.plugin.pluginId}".`,
      { pluginId: targetLocation.plugin.pluginId, instanceId: operation.instanceId },
    );
  }
  const acceptedCapabilities = destinationSlot.accepts.anyOfCapabilities;
  const capabilityMatch = targetCapabilities.some((capability) =>
    acceptedCapabilities.includes(capability),
  );
  if (!capabilityMatch) {
    moveIncompatible(
      "slot-capability-mismatch",
      `Plugin "${targetLocation.plugin.pluginId}" is incompatible with child Slot "${operation.placement.slot}".`,
      {
        instanceId: operation.instanceId,
        parentInstanceId: parentLocation.plugin.id,
        targetCapabilities: [...targetCapabilities],
        acceptedCapabilities: [...acceptedCapabilities],
      },
    );
  }

  const alreadySatisfied = targetLocation.target.type === "plugin_slot" &&
    targetLocation.target.parentInstanceId === parentLocation.plugin.id &&
    targetLocation.target.slot === operation.placement.slot;
  if (alreadySatisfied) {
    return {
      type: "plugin_slot",
      changed: false,
      instanceId: operation.instanceId,
      parentInstanceId: parentLocation.plugin.id,
      slot: operation.placement.slot,
      source: "plugin_slot",
    };
  }

  const destinationPlugins = parentLocation.plugin.slots?.[operation.placement.slot] ?? [];
  if (destinationSlot.cardinality === "one" && destinationPlugins.length > 0) {
    moveIncompatible(
      "slot-cardinality-full",
      `Destination child Slot "${operation.placement.slot}" already contains a Plugin.`,
      {
        parentInstanceId: parentLocation.plugin.id,
        slot: operation.placement.slot,
        cardinality: destinationSlot.cardinality,
      },
    );
  }

  const sourcePlan = sourceReflowForPluginMove(context, targetLocation);
  return {
    type: "plugin_slot",
    changed: true,
    instanceId: operation.instanceId,
    parentInstanceId: parentLocation.plugin.id,
    slot: operation.placement.slot,
    source: sourcePlan.source,
    ...(sourcePlan.sourceReflow === undefined
      ? {}
      : { sourceReflow: sourcePlan.sourceReflow }),
  };
}

function applyPluginMovePlan(
  context: MutationContext,
  plan: PluginMovePlan,
): void {
  if (!plan.changed) return;
  if (plan.type === "relative") {
    applyOperation(context, {
      type: "move_layout_node",
      nodeRef: plan.branchRef,
      newParentRef: plan.parentRef,
      index: plan.insertionIndex,
    });
    return;
  }

  const detached = detachPlugin(context, plan.instanceId);
  const destination = pluginContainer(context, {
    type: "plugin_slot",
    parentInstanceId: plan.parentInstanceId,
    slot: plan.slot,
  });
  insertAt(destination, detached.plugin, undefined, "Plugin target");
  if (plan.sourceReflow !== undefined) {
    applyLayoutReflow(context, plan.sourceReflow);
  }
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

function insertChild(parent: ChildrenNode, node: AppUILayoutNode, index: number | undefined, size: AppUILayoutTrackSize | undefined): void {
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

function detachChild(entry: CurrentNodeEntry): { node: AppUILayoutNode; size?: AppUILayoutTrackSize } {
  if (entry.parentKind !== "children" || entry.parent === undefined || entry.index === undefined) {
    operationError("LAYOUT_NODE_NOT_MOVABLE", "The root or panel child cannot be moved as a layout child.");
  }
  const parent = childContainer(entry.parent, "detach_layout_node");
  const [node] = parent.children.splice(entry.index, 1);
  let size: AppUILayoutTrackSize | undefined;
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
    case "execute_creator_action":
      operationError(
        "SEMANTIC_OPERATION_NOT_LOWERED",
        "execute_creator_action must be resolved by the AppUI transaction Host before applying operations.",
      );
    case "insert_plugin":
      assertUniquePluginIds(context.model, operation.plugin);
      insertAt(pluginContainer(context, operation.target), structuredClone(operation.plugin), operation.index, "Plugin target");
      return;
    case "insert_plugin_default":
      operationError(
        "SEMANTIC_OPERATION_NOT_LOWERED",
        "insert_plugin_default must be lowered by the AppUI transaction Host before applying operations.",
      );
    case "remove_plugin_default": {
      const location = requiredPluginLocation(context.model, operation.instanceId);
      const reflowPlan = tryPlanDefaultLayoutReflow(context, location);
      detachPlugin(context, operation.instanceId);
      if (reflowPlan !== undefined) {
        applyLayoutReflow(context, reflowPlan);
      }
      return;
    }
    case "move_plugin": {
      const detached = detachPlugin(context, operation.instanceId);
      const destination = pluginContainer(context, operation.target);
      const adjustedIndex = operation.index !== undefined && detached.container === destination && detached.index < operation.index
        ? operation.index - 1
        : operation.index;
      insertAt(destination, detached.plugin, adjustedIndex, "Plugin target");
      return;
    }
    case "move_plugin_to":
      applyPluginMovePlan(
        context,
        planPluginMove(
          context.model,
          operation,
          context.pluginMoveContracts,
        ),
      );
      return;
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

export interface AppUIOperationApplyOptions {
  readonly pluginMoveContracts?: AppUIPluginMoveContracts | undefined;
  readonly workspacePolicy?: AgentUIWorkspacePolicy | undefined;
}

export function applyAppUIOperations(
  source: AppUIModel,
  operations: readonly AppUIOperation[],
  options: AppUIOperationApplyOptions = {},
): AppUIModel {
  const model = structuredClone(source);
  validateLayoutLocalRefs(operations);
  const context: MutationContext = {
    model,
    snapshot: buildLayoutRefIndex(model.root),
    localRefs: new Map(),
    ...(options.pluginMoveContracts === undefined
      ? {}
      : { pluginMoveContracts: options.pluginMoveContracts }),
    ...(options.workspacePolicy === undefined
      ? {}
      : { workspacePolicy: options.workspacePolicy }),
  };
  for (const operation of operations) {
    const preserveStackActive = operation.type === "insert_layout_node" ||
      operation.type === "move_layout_node" ||
      operation.type === "replace_layout_node" ||
      operation.type === "remove_layout_node" ||
      operation.type === "insert_layout_relative" ||
      operation.type === "move_plugin_to";
    const states = preserveStackActive ? captureStackActiveStates(model) : [];
    applyOperation(context, operation);
    if (preserveStackActive) restoreStackActiveStates(model, states);
  }
  return model;
}
