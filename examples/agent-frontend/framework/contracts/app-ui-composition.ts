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

export type AppUICompositionSlotOwner =
  | {
      readonly kind: "layout";
      readonly nodeId: string;
    }
  | {
      readonly kind: "plugin";
      readonly instanceId: string;
      readonly pluginId: string;
    };

export interface AppUICompositionResolution {
  readonly reachableSlots: ReadonlySet<string>;
  readonly reachableInstances: ReadonlySet<string>;
  readonly slotOwners: ReadonlyMap<string, AppUICompositionSlotOwner>;
  readonly issues: readonly AppUICompositionIssue[];
}

export class AppUICompositionError extends Error {
  readonly issues: readonly AppUICompositionIssue[];

  constructor(issues: readonly AppUICompositionIssue[]) {
    super(issues.map((issue) => issue.message).join("\n"));
    this.name = "AppUICompositionError";
    this.issues = Object.freeze([...issues]);
  }
}

function collectLayoutSlots(
  node: LayoutNode,
  result: Map<string, AppUICompositionSlotOwner>,
): void {
  if (node.type === "slot") {
    result.set(node.slotId, { kind: "layout", nodeId: node.id });
    return;
  }
  if (node.type === "panel") {
    collectLayoutSlots(node.child, result);
    return;
  }
  node.children.forEach((child) => collectLayoutSlots(child, result));
}

/**
 * Resolves the Layout-rooted Plugin composition graph for Runtime validation
 * and development-time inspection.
 *
 * This deliberately ignores `enabled`: configuration validity describes the
 * potential graph, while the Runtime independently decides which instances
 * are currently live.
 */
export function resolveAppUIComposition(
  model: AppUIModel,
  slotCatalog: PluginSlotCatalog,
): AppUICompositionResolution {
  const layoutSlotOwners = new Map<string, AppUICompositionSlotOwner>();
  collectLayoutSlots(model.root, layoutSlotOwners);
  const layoutSlots = new Set(layoutSlotOwners.keys());

  const reachableSlots = new Set(layoutSlots);
  const reachableInstances = new Set<string>();
  const childOwners = new Map<string, string>();
  const slotOwners = new Map(layoutSlotOwners);
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
          if (!layoutSlots.has(childSlotId)) {
            slotOwners.set(childSlotId, {
              kind: "plugin",
              instanceId: instance.id,
              pluginId: instance.pluginId,
            });
          }
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

  return {
    reachableSlots,
    reachableInstances,
    slotOwners,
    issues: Object.freeze(issues),
  };
}

/** Validates the same resolution consumed by Runtime and Creator inspection. */
export function validateAppUIComposition(
  model: AppUIModel,
  slotCatalog: PluginSlotCatalog,
): void {
  const resolution = resolveAppUIComposition(model, slotCatalog);
  if (resolution.issues.length > 0) {
    throw new AppUICompositionError(resolution.issues);
  }
}
