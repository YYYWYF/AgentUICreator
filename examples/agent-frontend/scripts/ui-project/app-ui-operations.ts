import { z } from "zod";

import {
  layoutNodeSchema,
  layoutSizeSchema,
  pluginInstanceSchema,
  uiSlotSchema,
  type AppUIModel,
  type LayoutNode,
  type LayoutSize,
  type PluginInstance,
  type RowNode,
  type ColumnNode,
  type StackNode,
  type PanelNode,
  type SlotNode,
  type UISlot,
  type UISlotOccupant,
} from "../../framework/contracts/app-ui-model";

const nonBlankStringSchema = z.string().trim().min(1).max(200);
const indexSchema = z.number().int().nonnegative().optional();
const removeKeysSchema = z.array(nonBlankStringSchema).max(50).optional();

export const appUIOperationSchema = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("add_instance"),
    instance: pluginInstanceSchema,
  }),
  z.strictObject({
    type: z.literal("update_instance_props"),
    instanceId: nonBlankStringSchema,
    set: z.record(z.string(), z.unknown()).optional(),
    removeKeys: removeKeysSchema,
  }),
  z.strictObject({
    type: z.literal("set_instance_enabled"),
    instanceId: nonBlankStringSchema,
    enabled: z.boolean(),
  }),
  z.strictObject({
    type: z.literal("add_slot"),
    slot: uiSlotSchema,
  }),
  z.strictObject({
    type: z.literal("remove_slot"),
    slotId: nonBlankStringSchema,
  }),
  z.strictObject({
    type: z.literal("mount_instance"),
    instanceId: nonBlankStringSchema,
    slotId: nonBlankStringSchema,
    index: indexSchema,
    id: nonBlankStringSchema.optional(),
    key: nonBlankStringSchema.optional(),
    order: z.number().finite().optional(),
  }),
  z.strictObject({
    type: z.literal("unmount_instance"),
    instanceId: nonBlankStringSchema,
  }),
  z.strictObject({
    type: z.literal("move_instance"),
    instanceId: nonBlankStringSchema,
    slotId: nonBlankStringSchema,
    index: indexSchema,
    id: nonBlankStringSchema.optional(),
    key: nonBlankStringSchema.optional(),
    order: z.number().finite().optional(),
  }),
  z.strictObject({
    type: z.literal("replace_instance"),
    instanceId: nonBlankStringSchema,
    replacement: pluginInstanceSchema,
    slotId: nonBlankStringSchema.optional(),
    index: indexSchema,
    id: nonBlankStringSchema.optional(),
    key: nonBlankStringSchema.optional(),
    order: z.number().finite().optional(),
  }),
  z.strictObject({
    type: z.literal("remove_instance"),
    instanceId: nonBlankStringSchema,
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

type ChildrenNode = RowNode | ColumnNode | StackNode;

interface NodeIndexEntry {
  node: LayoutNode;
  path: string;
  parent?: LayoutNode | undefined;
  parentKind: "root" | "children" | "panel";
  index?: number | undefined;
}

interface MountedInstanceLocation {
  slot: UISlot;
  index: number;
  occupant: UISlotOccupant;
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

function operationError(
  code: string,
  message: string,
  details?: unknown,
): never {
  throw new AppUIOperationError(code, message, details);
}

export function buildLayoutNodeIndex(root: LayoutNode): Map<string, NodeIndexEntry> {
  const index = new Map<string, NodeIndexEntry>();

  const visit = (
    node: LayoutNode,
    path: string,
    parent: LayoutNode | undefined,
    parentKind: NodeIndexEntry["parentKind"],
    childIndex?: number,
  ): void => {
    if (index.has(node.id)) {
      operationError(
        "DUPLICATE_LAYOUT_NODE_ID",
        `Layout node id "${node.id}" is duplicated.`,
      );
    }
    index.set(node.id, {
      node,
      path,
      parent,
      parentKind,
      ...(childIndex === undefined ? {} : { index: childIndex }),
    });

    if (node.type === "row" || node.type === "column" || node.type === "stack") {
      node.children.forEach((child, childPosition) =>
        visit(
          child,
          `${path}.children[${childPosition}]`,
          node,
          "children",
          childPosition,
        ),
      );
    } else if (node.type === "panel") {
      visit(node.child, `${path}.child`, node, "panel");
    }
  };

  visit(root, "root", undefined, "root");
  return index;
}

function requiredNode(model: AppUIModel, nodeId: string): NodeIndexEntry {
  const entry = buildLayoutNodeIndex(model.root).get(nodeId);
  if (entry === undefined) {
    operationError("LAYOUT_NODE_NOT_FOUND", `Layout node "${nodeId}" does not exist.`);
  }
  return entry;
}

function requiredInstance(model: AppUIModel, instanceId: string): PluginInstance {
  const instance = model.pluginInstances[instanceId];
  if (instance === undefined) {
    operationError(
      "PLUGIN_INSTANCE_NOT_FOUND",
      `Plugin instance "${instanceId}" does not exist.`,
    );
  }
  return instance;
}

function requiredSlot(model: AppUIModel, slotId: string): UISlot {
  const slot = model.slots[slotId];
  if (slot === undefined) {
    operationError("SLOT_NOT_FOUND", `Slot "${slotId}" does not exist.`);
  }
  return slot;
}

function mountedInstanceLocation(
  model: AppUIModel,
  instanceId: string,
): MountedInstanceLocation | undefined {
  let result: MountedInstanceLocation | undefined;
  for (const slot of Object.values(model.slots)) {
    const instanceIndex = slot.occupants.findIndex(
      (occupant) => occupant.instanceId === instanceId,
    );
    if (instanceIndex < 0) {
      continue;
    }
    if (result !== undefined) {
      operationError(
        "PLUGIN_INSTANCE_MOUNTED_MULTIPLE_TIMES",
        `Plugin instance "${instanceId}" is mounted more than once.`,
      );
    }
    result = { slot, index: instanceIndex, occupant: slot.occupants[instanceIndex]! };
  }
  return result;
}

function insertAt<T>(items: T[], item: T, index: number | undefined, label: string): void {
  const targetIndex = index ?? items.length;
  if (targetIndex > items.length) {
    operationError(
      "INDEX_OUT_OF_RANGE",
      `${label} index ${targetIndex} exceeds length ${items.length}.`,
    );
  }
  items.splice(targetIndex, 0, item);
}

function mountInstance(
  model: AppUIModel,
  instanceId: string,
  slotId: string,
  index?: number,
  occupantOptions: Omit<UISlotOccupant, "instanceId"> = {},
): void {
  requiredInstance(model, instanceId);
  const location = mountedInstanceLocation(model, instanceId);
  if (location !== undefined) {
    operationError(
      "PLUGIN_INSTANCE_ALREADY_MOUNTED",
      `Plugin instance "${instanceId}" is already mounted in Slot "${location.slot.id}".`,
    );
  }
  const occupant = { instanceId, ...occupantOptions };
  insertAt(requiredSlot(model, slotId).occupants, occupant, index, "Slot");
}

function unmountInstance(model: AppUIModel, instanceId: string): void {
  requiredInstance(model, instanceId);
  const location = mountedInstanceLocation(model, instanceId);
  if (location !== undefined) {
    location.slot.occupants.splice(location.index, 1);
  }
}

function childContainer(node: LayoutNode, operation: string): ChildrenNode {
  if (node.type === "row" || node.type === "column" || node.type === "stack") {
    return node;
  }
  operationError(
    "LAYOUT_PARENT_NOT_CONTAINER",
    `${operation} requires a row, column, or stack parent; "${node.id}" is ${node.type}.`,
  );
}

function insertChild(
  parent: ChildrenNode,
  node: LayoutNode,
  index: number | undefined,
  size: LayoutSize | undefined,
): void {
  const targetIndex = index ?? parent.children.length;
  if (targetIndex > parent.children.length) {
    operationError(
      "INDEX_OUT_OF_RANGE",
      `Layout child index ${targetIndex} exceeds length ${parent.children.length}.`,
    );
  }
  if (parent.type === "row" || parent.type === "column") {
    if (parent.sizes !== undefined) {
      if (size === undefined) {
        operationError(
          "LAYOUT_SIZE_REQUIRED",
          `Parent "${parent.id}" has sizes; the inserted child requires a size.`,
        );
      }
      parent.sizes.splice(targetIndex, 0, size);
    } else if (size !== undefined) {
      operationError(
        "LAYOUT_SIZE_NOT_APPLICABLE",
        `Parent "${parent.id}" does not define sizes.`,
      );
    }
  } else if (size !== undefined) {
    operationError(
      "LAYOUT_SIZE_NOT_APPLICABLE",
      `Stack parent "${parent.id}" does not support child sizes.`,
    );
  }
  parent.children.splice(targetIndex, 0, node);
}

function detachChild(entry: NodeIndexEntry): {
  node: LayoutNode;
  size?: LayoutSize | undefined;
} {
  if (
    entry.parentKind !== "children" ||
    entry.parent === undefined ||
    entry.index === undefined
  ) {
    operationError(
      "LAYOUT_NODE_NOT_MOVABLE",
      `Layout node "${entry.node.id}" is not a child of row, column, or stack.`,
    );
  }
  const parent = childContainer(entry.parent, "detach_layout_node");
  const [node] = parent.children.splice(entry.index, 1);
  let size: LayoutSize | undefined;
  if (
    (parent.type === "row" || parent.type === "column") &&
    parent.sizes !== undefined
  ) {
    [size] = parent.sizes.splice(entry.index, 1);
  }
  return { node: node!, ...(size === undefined ? {} : { size }) };
}

function subtreeSlotIds(node: LayoutNode): Set<string> {
  const result = new Set<string>();
  const visit = (current: LayoutNode): void => {
    if (current.type === "slot") {
      result.add(current.slotId);
    } else if (current.type === "panel") {
      visit(current.child);
    } else {
      current.children.forEach(visit);
    }
  };
  visit(node);
  return result;
}

function mountedUnderSlots(model: AppUIModel, roots: ReadonlySet<string>): Set<string> {
  const result = new Set<string>();
  const visitSlot = (slotId: string): void => {
    const slot = model.slots[slotId];
    if (slot === undefined) return;
    slot.occupants.forEach((occupant) => {
      if (result.has(occupant.instanceId)) return;
      result.add(occupant.instanceId);
      Object.values(model.slots)
        .filter(
          (child) =>
            child.owner.type === "plugin-instance" &&
            child.owner.instanceId === occupant.instanceId,
        )
        .forEach((child) => visitSlot(child.id));
    });
  };
  roots.forEach(visitSlot);
  return result;
}

function assertSubtreeCanDisappear(
  model: AppUIModel,
  oldNode: LayoutNode,
  replacement?: LayoutNode,
): void {
  const mountedBefore = mountedUnderSlots(model, subtreeSlotIds(oldNode));
  const retained = replacement === undefined
    ? new Set<string>()
    : mountedUnderSlots(model, subtreeSlotIds(replacement));
  const disappearing = [...mountedBefore].filter((instanceId) => !retained.has(instanceId));
  if (disappearing.length > 0) {
    operationError(
      "LAYOUT_SUBTREE_HAS_MOUNTED_INSTANCES",
      "Unmount, move, or remove mounted instances before removing their Layout subtree.",
      { instanceIds: disappearing.sort() },
    );
  }
}

function replaceNode(model: AppUIModel, entry: NodeIndexEntry, replacement: LayoutNode): void {
  assertSubtreeCanDisappear(model, entry.node, replacement);
  if (entry.parentKind === "root") {
    model.root = replacement;
    return;
  }
  if (entry.parent === undefined) {
    operationError("LAYOUT_PARENT_NOT_FOUND", `Parent for "${entry.node.id}" is missing.`);
  }
  if (entry.parentKind === "panel") {
    (entry.parent as PanelNode).child = replacement;
    return;
  }
  if (entry.index === undefined) {
    operationError("LAYOUT_PARENT_NOT_FOUND", `Child index for "${entry.node.id}" is missing.`);
  }
  childContainer(entry.parent, "replace_layout_node").children[entry.index] = replacement;
}

const layoutPropKeys: Record<LayoutNode["type"], ReadonlySet<string>> = {
  row: new Set(["gap", "sizes"]),
  column: new Set(["gap", "sizes"]),
  stack: new Set(["active"]),
  panel: new Set(["width", "height", "minWidth", "maxWidth", "resizable"]),
  slot: new Set(),
};

function updateLayoutNodeProps(
  node: LayoutNode,
  set: Record<string, unknown> | undefined,
  removeKeys: string[] | undefined,
): void {
  const allowed = layoutPropKeys[node.type];
  for (const key of [...Object.keys(set ?? {}), ...(removeKeys ?? [])]) {
    if (!allowed.has(key)) {
      operationError(
        "LAYOUT_PROP_NOT_MUTABLE",
        `Property "${key}" cannot be changed on ${node.type} node "${node.id}".`,
        { allowed: [...allowed] },
      );
    }
  }
  const target = node as unknown as Record<string, unknown>;
  for (const [key, value] of Object.entries(set ?? {})) {
    target[key] = value;
  }
  for (const key of removeKeys ?? []) {
    delete target[key];
  }
}

function applyOperation(model: AppUIModel, operation: AppUIOperation): void {
  switch (operation.type) {
    case "add_instance": {
      if (model.pluginInstances[operation.instance.id] !== undefined) {
        operationError(
          "PLUGIN_INSTANCE_ALREADY_EXISTS",
          `Plugin instance "${operation.instance.id}" already exists.`,
        );
      }
      model.pluginInstances[operation.instance.id] = structuredClone(operation.instance);
      return;
    }
    case "update_instance_props": {
      const instance = requiredInstance(model, operation.instanceId);
      const props = { ...(instance.props ?? {}) };
      for (const [key, value] of Object.entries(operation.set ?? {})) {
        props[key] = value;
      }
      for (const key of operation.removeKeys ?? []) {
        delete props[key];
      }
      if (Object.keys(props).length === 0) {
        delete instance.props;
      } else {
        instance.props = props;
      }
      return;
    }
    case "set_instance_enabled":
      requiredInstance(model, operation.instanceId).enabled = operation.enabled;
      return;
    case "add_slot": {
      if (model.slots[operation.slot.id] !== undefined) {
        operationError("SLOT_ALREADY_EXISTS", `Slot "${operation.slot.id}" already exists.`);
      }
      model.slots[operation.slot.id] = structuredClone(operation.slot);
      return;
    }
    case "remove_slot": {
      const slot = requiredSlot(model, operation.slotId);
      if (slot.occupants.length > 0) {
        operationError(
          "SLOT_HAS_OCCUPANTS",
          `Unmount Slot "${operation.slotId}" occupants before removing it.`,
          { instanceIds: slot.occupants.map((occupant) => occupant.instanceId) },
        );
      }
      delete model.slots[operation.slotId];
      return;
    }
    case "mount_instance":
      mountInstance(model, operation.instanceId, operation.slotId, operation.index, {
        ...(operation.id === undefined ? {} : { id: operation.id }),
        ...(operation.key === undefined ? {} : { key: operation.key }),
        ...(operation.order === undefined ? {} : { order: operation.order }),
      });
      return;
    case "unmount_instance":
      unmountInstance(model, operation.instanceId);
      return;
    case "move_instance": {
      requiredInstance(model, operation.instanceId);
      const previous = mountedInstanceLocation(model, operation.instanceId);
      if (previous !== undefined) {
        previous.slot.occupants.splice(previous.index, 1);
      }
      mountInstance(model, operation.instanceId, operation.slotId, operation.index, {
        ...((operation.id ?? previous?.occupant.id) === undefined
          ? {}
          : { id: operation.id ?? previous?.occupant.id }),
        ...((operation.key ?? previous?.occupant.key) === undefined
          ? {}
          : { key: operation.key ?? previous?.occupant.key }),
        ...((operation.order ?? previous?.occupant.order) === undefined
          ? {}
          : { order: operation.order ?? previous?.occupant.order }),
      });
      return;
    }
    case "replace_instance": {
      requiredInstance(model, operation.instanceId);
      if (operation.replacement.id === operation.instanceId) {
        operationError(
          "REPLACEMENT_INSTANCE_ID_UNCHANGED",
          "replace_instance requires a different replacement id; use update operations for the same instance.",
        );
      }
      if (model.pluginInstances[operation.replacement.id] !== undefined) {
        operationError(
          "PLUGIN_INSTANCE_ALREADY_EXISTS",
          `Plugin instance "${operation.replacement.id}" already exists.`,
        );
      }
      const previous = mountedInstanceLocation(model, operation.instanceId);
      if (previous !== undefined) {
        previous.slot.occupants.splice(previous.index, 1);
      }
      model.pluginInstances[operation.replacement.id] = structuredClone(
        operation.replacement,
      );
      delete model.pluginInstances[operation.instanceId];
      const destinationSlotId = operation.slotId ?? previous?.slot.id;
      if (destinationSlotId === undefined && operation.index !== undefined) {
        operationError(
          "REPLACEMENT_MOUNT_REQUIRED",
          "replace_instance index requires slotId or an existing mount.",
        );
      }
      if (destinationSlotId !== undefined) {
        const destinationIndex =
          operation.index ??
          (previous?.slot.id === destinationSlotId
            ? previous?.index
            : undefined);
        mountInstance(
          model,
          operation.replacement.id,
          destinationSlotId,
          destinationIndex,
          {
            ...((operation.id ?? previous?.occupant.id) === undefined
              ? {}
              : { id: operation.id ?? previous?.occupant.id }),
            ...((operation.key ?? previous?.occupant.key) === undefined
              ? {}
              : { key: operation.key ?? previous?.occupant.key }),
            ...((operation.order ?? previous?.occupant.order) === undefined
              ? {}
              : { order: operation.order ?? previous?.occupant.order }),
          },
        );
      }
      return;
    }
    case "remove_instance": {
      requiredInstance(model, operation.instanceId);
      const location = mountedInstanceLocation(model, operation.instanceId);
      if (location !== undefined) {
        operationError(
          "PLUGIN_INSTANCE_STILL_MOUNTED",
          `Unmount plugin instance "${operation.instanceId}" before removing it.`,
          { slotId: location.slot.id },
        );
      }
      delete model.pluginInstances[operation.instanceId];
      return;
    }
    case "insert_layout_node": {
      const parent = childContainer(
        requiredNode(model, operation.parentNodeId).node,
        operation.type,
      );
      insertChild(parent, structuredClone(operation.node), operation.index, operation.size);
      return;
    }
    case "update_layout_node_props":
      updateLayoutNodeProps(
        requiredNode(model, operation.nodeId).node,
        operation.set,
        operation.removeKeys,
      );
      return;
    case "move_layout_node": {
      if (operation.nodeId === model.root.id) {
        operationError("LAYOUT_ROOT_NOT_MOVABLE", "The Layout root cannot be moved.");
      }
      const beforeIndex = buildLayoutNodeIndex(model.root);
      const entry = beforeIndex.get(operation.nodeId);
      const parentEntry = beforeIndex.get(operation.newParentNodeId);
      if (entry === undefined || parentEntry === undefined) {
        operationError(
          "LAYOUT_NODE_NOT_FOUND",
          `Layout node or destination parent does not exist.`,
        );
      }
      const descendants = new Set(buildLayoutNodeIndex(entry.node).keys());
      if (descendants.has(operation.newParentNodeId)) {
        operationError(
          "LAYOUT_MOVE_CYCLE",
          `Cannot move "${operation.nodeId}" into its own subtree.`,
        );
      }
      childContainer(parentEntry.node, operation.type);
      const detached = detachChild(entry);
      const destination = childContainer(
        requiredNode(model, operation.newParentNodeId).node,
        operation.type,
      );
      const inheritedSize =
        (destination.type === "row" || destination.type === "column") &&
        destination.sizes !== undefined
          ? detached.size
          : undefined;
      insertChild(
        destination,
        detached.node,
        operation.index,
        operation.size ?? inheritedSize,
      );
      return;
    }
    case "replace_layout_node":
      replaceNode(
        model,
        requiredNode(model, operation.nodeId),
        structuredClone(operation.node),
      );
      return;
    case "remove_layout_node": {
      if (operation.nodeId === model.root.id) {
        operationError("LAYOUT_ROOT_NOT_REMOVABLE", "The Layout root cannot be removed.");
      }
      const entry = requiredNode(model, operation.nodeId);
      assertSubtreeCanDisappear(model, entry.node);
      detachChild(entry);
      return;
    }
  }
}

export function applyAppUIOperations(
  source: AppUIModel,
  operations: readonly AppUIOperation[],
): AppUIModel {
  const model = structuredClone(source);
  operations.forEach((operation) => applyOperation(model, operation));
  return model;
}
