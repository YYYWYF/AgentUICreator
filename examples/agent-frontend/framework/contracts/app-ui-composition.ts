import type { AppUIModel, LayoutNode } from "./app-ui-model";

/** Static child Slot declarations keyed by UI Plugin manifest id. */
export type PluginSlotCatalog = Readonly<
  Record<string, readonly string[]>
>;

export type AppUICompositionIssueCode =
  | "mount-slot-unreachable"
  | "plugin-child-slot-owner-duplicate"
  | "plugin-child-slot-layout-collision";

export interface AppUICompositionIssue {
  readonly code: AppUICompositionIssueCode;
  readonly instanceId: string;
  readonly slotId: string;
  readonly message: string;
}

export class AppUICompositionError extends Error {
  readonly issues: readonly AppUICompositionIssue[];

  constructor(issues: readonly AppUICompositionIssue[]) {
    super(issues.map((issue) => issue.message).join("\n"));
    this.name = "AppUICompositionError";
    this.issues = Object.freeze([...issues]);
  }
}

function collectLayoutSlotIds(node: LayoutNode, result: Set<string>): void {
  if (node.type === "slot") {
    result.add(node.slotId);
    return;
  }
  if (node.type === "panel") {
    collectLayoutSlotIds(node.child, result);
    return;
  }
  node.children.forEach((child) => collectLayoutSlotIds(child, result));
}

/**
 * Validates the Layout-rooted Plugin composition graph.
 *
 * This deliberately ignores `enabled`: configuration validity describes the
 * potential graph, while the Runtime independently decides which instances
 * are currently live.
 */
export function validateAppUIComposition(
  model: AppUIModel,
  slotCatalog: PluginSlotCatalog,
): void {
  const layoutSlots = new Set<string>();
  collectLayoutSlotIds(model.root, layoutSlots);

  const reachableSlots = new Set(layoutSlots);
  const reachableInstances = new Set<string>();
  const childOwners = new Map<string, string>();
  const issues: AppUICompositionIssue[] = [];
  const mountedInstances = Object.values(model.pluginInstances)
    .filter((instance) => instance.mount !== undefined)
    .sort((left, right) => left.id.localeCompare(right.id));

  let madeProgress = true;
  while (madeProgress) {
    madeProgress = false;

    for (const instance of mountedInstances) {
      if (
        reachableInstances.has(instance.id) ||
        !reachableSlots.has(instance.mount!.slotId)
      ) {
        continue;
      }

      reachableInstances.add(instance.id);
      madeProgress = true;

      for (const childSlotId of slotCatalog[instance.pluginId] ?? []) {
        if (layoutSlots.has(childSlotId)) {
          issues.push({
            code: "plugin-child-slot-layout-collision",
            instanceId: instance.id,
            slotId: childSlotId,
            message: `Plugin instance "${instance.id}" declares child Slot "${childSlotId}", which collides with a Layout Slot.`,
          });
        }

        const existingOwner = childOwners.get(childSlotId);
        if (existingOwner !== undefined && existingOwner !== instance.id) {
          issues.push({
            code: "plugin-child-slot-owner-duplicate",
            instanceId: instance.id,
            slotId: childSlotId,
            message: `Plugin instance "${instance.id}" declares child Slot "${childSlotId}", which is already owned by reachable instance "${existingOwner}".`,
          });
        } else if (existingOwner === undefined) {
          childOwners.set(childSlotId, instance.id);
        }

        reachableSlots.add(childSlotId);
      }
    }
  }

  for (const instance of mountedInstances) {
    if (!reachableInstances.has(instance.id)) {
      issues.push({
        code: "mount-slot-unreachable",
        instanceId: instance.id,
        slotId: instance.mount!.slotId,
        message: `Plugin instance "${instance.id}" mount Slot "${instance.mount!.slotId}" is not reachable from the Layout Tree.`,
      });
    }
  }

  if (issues.length > 0) {
    throw new AppUICompositionError(issues);
  }
}
