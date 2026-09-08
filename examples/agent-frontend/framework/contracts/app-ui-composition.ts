import type { AppUIModel, LayoutNode } from "./app-ui-model";

/** Static child Slot declarations keyed by UI Plugin manifest id. */
export type PluginSlotCatalog = Readonly<
  Record<string, readonly string[]>
>;

export interface PluginCompositionCatalogEntry {
  readonly childSlots?: readonly string[];
  readonly applicationGate?: {
    readonly service: string;
    readonly priority?: number;
  };
  readonly capabilities?: readonly string[];
  readonly provides?: readonly string[];
  readonly inject?: readonly string[];
}

export type PluginCompositionCatalog = Readonly<
  Record<string, readonly string[] | PluginCompositionCatalogEntry>
>;

export type AppUICompositionIssueCode =
  | "mount-slot-unreachable"
  | "plugin-child-slot-owner-duplicate"
  | "plugin-child-slot-layout-collision"
  | "application-gate-must-not-mount"
  | "application-gate-must-not-declare-child-slots"
  | "application-gate-service-not-provided"
  | "application-gate-dependency-missing"
  | "application-gate-dependency-provider-collision"
  | "application-gate-dependency-not-foundation-safe";

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

export interface ApplicationFoundationResolution {
  readonly gateInstanceIds: ReadonlySet<string>;
  readonly foundationInstanceIds: ReadonlySet<string>;
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

function catalogEntry(
  catalog: PluginCompositionCatalog,
  pluginId: string,
): PluginCompositionCatalogEntry {
  const entry = catalog[pluginId];
  return Array.isArray(entry)
    ? { childSlots: entry }
    : (entry ?? {}) as PluginCompositionCatalogEntry;
}

export function resolveApplicationFoundation(
  model: AppUIModel,
  catalog: PluginCompositionCatalog,
): ApplicationFoundationResolution {
  const instances = Object.values(model.pluginInstances).sort((left, right) =>
    left.id.localeCompare(right.id),
  );
  const enabledInstances = instances.filter((instance) => instance.enabled);
  const gateInstances = enabledInstances.filter(
    (instance) =>
      catalogEntry(catalog, instance.pluginId).applicationGate !== undefined,
  );
  const gateInstanceIds = new Set(gateInstances.map((instance) => instance.id));
  const foundationInstanceIds = new Set(gateInstanceIds);
  const issues: AppUICompositionIssue[] = [];

  for (const instance of instances) {
    const entry = catalogEntry(catalog, instance.pluginId);
    const gate = entry.applicationGate;
    if (gate === undefined) continue;
    if (instance.mount !== undefined) {
      issues.push({
        code: "application-gate-must-not-mount",
        instanceId: instance.id,
        slotId: instance.mount.slotId,
        message: `Application Gate instance "${instance.id}" must not mount to Slot "${instance.mount.slotId}".`,
      });
    }
    if ((entry.childSlots?.length ?? 0) > 0) {
      issues.push({
        code: "application-gate-must-not-declare-child-slots",
        instanceId: instance.id,
        slotId: entry.childSlots?.[0] ?? "",
        message: `Application Gate plugin "${instance.pluginId}" must not declare child Slots.`,
      });
    }
    if (!(entry.provides ?? []).includes(gate.service)) {
      issues.push({
        code: "application-gate-service-not-provided",
        instanceId: instance.id,
        slotId: "",
        message: `Application Gate plugin "${instance.pluginId}" must declare Gate service "${gate.service}" in provides.`,
      });
    }
  }

  const queue = [...gateInstances];
  for (let index = 0; index < queue.length; index += 1) {
    const consumer = queue[index];
    if (consumer === undefined) continue;
    const consumerEntry = catalogEntry(catalog, consumer.pluginId);
    for (const service of consumerEntry.inject ?? []) {
      const providers = enabledInstances.filter((candidate) => {
        const candidateEntry = catalogEntry(catalog, candidate.pluginId);
        return (candidateEntry.provides ?? []).includes(service);
      });
      if (providers.length === 0) {
        issues.push({
          code: "application-gate-dependency-missing",
          instanceId: consumer.id,
          slotId: "",
          message: `Application Gate foundation dependency "${service}" required by instance "${consumer.id}" has no enabled Provider.`,
        });
        continue;
      }
      if (providers.length > 1) {
        issues.push({
          code: "application-gate-dependency-provider-collision",
          instanceId: consumer.id,
          slotId: "",
          message: `Application Gate foundation dependency "${service}" required by instance "${consumer.id}" has multiple enabled Providers: ${providers.map((provider) => provider.id).join(", ")}.`,
        });
        continue;
      }
      const provider = providers[0]!;
      const providerEntry = catalogEntry(catalog, provider.pluginId);
      const foundationSafe =
        provider.mount === undefined &&
        (providerEntry.applicationGate !== undefined ||
          providerEntry.capabilities?.includes("headless") === true);
      if (!foundationSafe) {
        issues.push({
          code: "application-gate-dependency-not-foundation-safe",
          instanceId: provider.id,
          slotId: provider.mount?.slotId ?? "",
          message: `Application Gate dependency Provider instance "${provider.id}" for service "${service}" must be an unmounted headless or Application Gate plugin.`,
        });
        continue;
      }
      if (!foundationInstanceIds.has(provider.id)) {
        foundationInstanceIds.add(provider.id);
        queue.push(provider);
      }
    }
  }

  return {
    gateInstanceIds,
    foundationInstanceIds,
    issues: Object.freeze(issues),
  };
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
  slotCatalog: PluginCompositionCatalog,
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

      const childSlots =
        catalogEntry(slotCatalog, instance.pluginId).childSlots ?? [];
      for (const childSlotId of childSlots) {
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

  issues.push(...resolveApplicationFoundation(model, slotCatalog).issues);

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
  slotCatalog: PluginCompositionCatalog,
): void {
  const resolution = resolveAppUIComposition(model, slotCatalog);
  if (resolution.issues.length > 0) {
    throw new AppUICompositionError(resolution.issues);
  }
}
