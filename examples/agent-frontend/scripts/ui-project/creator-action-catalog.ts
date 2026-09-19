import { createHash } from "node:crypto";

import {
  collectAppUIPluginLocations,
  type AppUIModel,
} from "../../framework/contracts/app-ui-model";
import {
  applyAppUIOperations,
  planPluginMove,
  resolveDefaultPluginRemovalReflow,
  resolvePluginMoveVisualRegion,
  type AppUIOperation,
  type AppUIPluginMoveOperation,
} from "./app-ui-operations";
import {
  CreatorActionPlanningError,
  isVisualAsset,
  planDefaultPluginInsertion,
  pluginMoveContractsForGeneration,
} from "./creator-action-planners";
import type {
  GeneratePluginCatalogResult,
  PluginAsset,
  PluginProjectFacts,
} from "./types";
import { generatePluginRegistryFromFacts } from "./registry-generator";

export const MAX_CREATOR_ACTION_CANDIDATES = 256;
export const MAX_CREATOR_ACTIONS_PER_TARGET = 32;
export const MAX_ACTION_LABEL_CHARS = 200;
export const MAX_ACTION_DESCRIPTION_CHARS = 400;
export const MAX_ACTION_ID_CHARS = 64;

export type CreatorActionKind =
  | "add_existing_plugin"
  | "remove_plugin"
  | "move_plugin";

export type CreatorActionStatus = "ready" | "already_satisfied";

export type CreatorActionEffect =
  | { type: "add_default" }
  | { type: "remove" }
  | {
      type: "relative";
      anchorPluginId: string;
      anchorPluginName: string;
      anchorInstanceId: string;
      relation: "before" | "after";
    }
  | { type: "row_edge"; edge: "left" | "right" }
  | {
      type: "plugin_slot";
      parentPluginId: string;
      parentPluginName: string;
      parentInstanceId: string;
      slot: string;
    };

export interface CreatorActionTarget {
  pluginId: string;
  pluginName: string;
  instanceId?: string;
}

export interface CreatorActionCandidate {
  actionId: string;
  kind: CreatorActionKind;
  status: CreatorActionStatus;
  label: string;
  description: string;
  target: CreatorActionTarget;
  effect: CreatorActionEffect;
}

export type CreatorActionOperation = Extract<
  AppUIOperation,
  { type: "insert_plugin_default" | "remove_plugin_default" | "move_plugin_to" }
>;

export type CreatorActionBinding =
  | {
      actionId: string;
      status: "already_satisfied";
    }
  | {
      actionId: string;
      status: "ready";
      operation: CreatorActionOperation;
    };

export interface CreatorActionCatalog {
  appUIModelHash: string;
  revision: string;
  candidates: CreatorActionCandidate[];
  /** Host-only execution bindings. Never include this in a model snapshot. */
  bindings: Map<string, CreatorActionBinding>;
}

export interface CreatorActionCatalogBuilderInput {
  model: AppUIModel;
  generation: GeneratePluginCatalogResult;
  projectFacts: PluginProjectFacts;
  appUIModelHash: string;
}

export class CreatorActionCatalogError extends Error {
  readonly code: string;
  readonly details: unknown;

  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.name = "CreatorActionCatalogError";
    this.code = code;
    this.details = details;
  }
}

interface VisualRowRegion {
  instanceId: string;
  pluginId: string;
  pluginName: string;
  region: ReturnType<typeof resolvePluginMoveVisualRegion>;
}

function actionCatalogTooLarge(message: string, details?: unknown): never {
  throw new CreatorActionCatalogError(
    "CREATOR_ACTION_CATALOG_TOO_LARGE",
    message,
    details,
  );
}

function actionCatalogInvalid(message: string, details?: unknown): never {
  throw new CreatorActionCatalogError(
    "CREATOR_ACTION_CATALOG_INVALID",
    message,
    details,
  );
}

function actionCatalogBuildFailed(message: string, details?: unknown): never {
  throw new CreatorActionCatalogError(
    "CREATOR_ACTION_CATALOG_BUILD_FAILED",
    message,
    details,
  );
}

export interface CreatorActionSemanticIdentity {
  kind: CreatorActionKind;
  subject: Record<string, string>;
  effect: Record<string, string>;
}

function semanticEffectIdentity(effect: CreatorActionEffect): Record<string, string> {
  switch (effect.type) {
    case "add_default":
      return { type: effect.type };
    case "remove":
      return { type: effect.type };
    case "row_edge":
      return { type: effect.type, edge: effect.edge };
    case "relative":
      return {
        type: effect.type,
        anchorPluginId: effect.anchorPluginId,
        anchorInstanceId: effect.anchorInstanceId,
        relation: effect.relation,
      };
    case "plugin_slot":
      return {
        type: effect.type,
        parentPluginId: effect.parentPluginId,
        parentInstanceId: effect.parentInstanceId,
        slot: effect.slot,
      };
  }
}

export function semanticActionIdentity(
  kind: CreatorActionKind,
  target: CreatorActionTarget,
  effect: CreatorActionEffect,
): CreatorActionSemanticIdentity {
  const subject = kind === "add_existing_plugin"
    ? { pluginId: target.pluginId }
    : {
        pluginId: target.pluginId,
        ...(target.instanceId === undefined ? {} : { instanceId: target.instanceId }),
      };
  return {
    kind,
    subject,
    effect: semanticEffectIdentity(effect),
  };
}

export function actionIdFor(identity: CreatorActionSemanticIdentity): string {
  const source = JSON.stringify(identity);
  return `act_${createHash("sha256").update(source).digest("hex").slice(0, 24)}`;
}

function actionIdForCandidate(
  kind: CreatorActionKind,
  target: CreatorActionTarget,
  effect: CreatorActionEffect,
): string {
  return actionIdFor(semanticActionIdentity(kind, target, effect));
}

function errorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return undefined;
  }
  const code = error.code;
  return typeof code === "string" ? code : undefined;
}

/**
 * Return true only for a Host planner/precondition rejection. Unexpected
 * exceptions must escape Catalog construction as infrastructure failures.
 */
export function isExpectedCreatorActionRejection(error: unknown): boolean {
  if (error instanceof CreatorActionPlanningError) return true;
  const code = errorCode(error);
  if (code === undefined) return false;
  return (
    code.startsWith("AUTHORING_DEFAULT_PLACEMENT_") ||
    code === "AUTHORING_MOVE_UNSUPPORTED" ||
    code === "AUTHORING_MOVE_INCOMPATIBLE" ||
    code.startsWith("LAYOUT_") ||
    code === "PLUGIN_ALREADY_EXISTS" ||
    code === "INDEX_OUT_OF_RANGE" ||
    code === "PLUGIN_WIDTH_INCOMPATIBLE"
  );
}

function candidateTargetKey(target: CreatorActionTarget): string {
  return `${target.pluginId}\u0000${target.instanceId ?? ""}`;
}

function validateCandidate(candidate: CreatorActionCandidate): void {
  if (candidate.actionId.length > MAX_ACTION_ID_CHARS) {
    actionCatalogTooLarge(
      `Creator Action id exceeds ${MAX_ACTION_ID_CHARS} characters.`,
      { actionId: candidate.actionId, limit: MAX_ACTION_ID_CHARS },
    );
  }
  if (
    candidate.label.length > MAX_ACTION_LABEL_CHARS ||
    candidate.description.length > MAX_ACTION_DESCRIPTION_CHARS
  ) {
    actionCatalogTooLarge(
      "A Creator Action label or description exceeds the catalog bound.",
      {
        actionId: candidate.actionId,
        labelCharacters: candidate.label.length,
        descriptionCharacters: candidate.description.length,
        maxLabelCharacters: MAX_ACTION_LABEL_CHARS,
        maxDescriptionCharacters: MAX_ACTION_DESCRIPTION_CHARS,
      },
    );
  }
}

function uniqueAsset(
  assetsByPluginId: ReadonlyMap<string, readonly PluginAsset[]>,
  pluginId: string,
): PluginAsset | undefined {
  const assets = assetsByPluginId.get(pluginId) ?? [];
  return assets.length === 1 ? assets[0] : undefined;
}

function actionCandidate(
  kind: CreatorActionKind,
  status: CreatorActionStatus,
  target: CreatorActionTarget,
  effect: CreatorActionEffect,
  label: string,
  description: string,
): CreatorActionCandidate {
  const candidate: CreatorActionCandidate = {
    actionId: actionIdForCandidate(kind, target, effect),
    kind,
    status,
    label,
    description,
    target,
    effect,
  };
  validateCandidate(candidate);
  return candidate;
}

function pluginMoveOperation(
  instanceId: string,
  placement: AppUIPluginMoveOperation["placement"],
): Extract<CreatorActionOperation, { type: "move_plugin_to" }> {
  return {
    type: "move_plugin_to",
    instanceId,
    placement,
  };
}

async function validateCandidateBindingInMemory(
  input: CreatorActionCatalogBuilderInput,
  operation: CreatorActionOperation,
): Promise<boolean> {
  try {
    let afterModel: AppUIModel;
    let operationApplyOptions: {
      pluginMoveContracts: ReturnType<typeof pluginMoveContractsForGeneration>;
    } | undefined;

    switch (operation.type) {
      case "insert_plugin_default": {
        const plan = planDefaultPluginInsertion(
          input.model,
          operation,
          input.generation,
        );
        afterModel = applyAppUIOperations(input.model, plan.operations);
        break;
      }
      case "remove_plugin_default":
        resolveDefaultPluginRemovalReflow(input.model, operation.instanceId);
        afterModel = applyAppUIOperations(input.model, [operation]);
        break;
      case "move_plugin_to": {
        const pluginMoveContracts = pluginMoveContractsForGeneration(
          input.generation,
        );
        planPluginMove(input.model, operation, pluginMoveContracts);
        operationApplyOptions = { pluginMoveContracts };
        afterModel = applyAppUIOperations(input.model, [operation], operationApplyOptions);
        break;
      }
    }

    const nextGeneration = generatePluginRegistryFromFacts(
      afterModel,
      input.projectFacts,
    );
    if (nextGeneration.errors.length === 0) return true;

    const factIssueKeys = new Set(
      [
        ...input.projectFacts.inventoryIssues,
        ...input.projectFacts.declarations.issues,
        ...[...input.projectFacts.definitionIssuesByPath.values()].flat(),
      ].map((issue) => `${issue.code}\u0000${issue.message}`),
    );
    const infrastructureIssue = nextGeneration.errors.find((issue) =>
      factIssueKeys.has(`${issue.code}\u0000${issue.message}`),
    );
    if (infrastructureIssue !== undefined) {
      actionCatalogBuildFailed(
        "Creator Action binding validation observed an invalid project fact.",
        { issue: infrastructureIssue },
      );
    }
    return false;
  } catch (error) {
    if (isExpectedCreatorActionRejection(error)) return false;
    actionCatalogBuildFailed(
      "Creator Action binding validation failed unexpectedly.",
      { cause: error instanceof Error ? error.message : String(error) },
    );
  }
}

function visualRowRegions(
  model: AppUIModel,
  locations: ReturnType<typeof collectAppUIPluginLocations>,
  assetsByPluginId: ReadonlyMap<string, readonly PluginAsset[]>,
): VisualRowRegion[] {
  return locations
    .flatMap(({ plugin }) => {
      const asset = uniqueAsset(assetsByPluginId, plugin.pluginId);
      if (!isVisualAsset(asset)) return [];
      try {
        const region = resolvePluginMoveVisualRegion(model, plugin.id);
        return [{
          instanceId: plugin.id,
          pluginId: plugin.pluginId,
          pluginName: asset.name,
          region,
        }];
      } catch (error) {
        if (isExpectedCreatorActionRejection(error)) return [];
        actionCatalogBuildFailed(
          "Creator Action row-region discovery failed unexpectedly.",
          { cause: error instanceof Error ? error.message : String(error) },
        );
      }
    })
    .sort((left, right) => left.instanceId.localeCompare(right.instanceId));
}

export async function buildCreatorActionCatalog(
  input: CreatorActionCatalogBuilderInput,
): Promise<CreatorActionCatalog> {
  if (input.generation.errors.length > 0) {
    actionCatalogBuildFailed(
      "Creator Action Catalog requires a healthy current project generation.",
      { issues: input.generation.errors },
    );
  }

  const assetsByPluginId = new Map<string, PluginAsset[]>();
  for (const asset of input.generation.assets) {
    const matches = assetsByPluginId.get(asset.pluginId) ?? [];
    matches.push(asset);
    assetsByPluginId.set(asset.pluginId, matches);
  }

  const locations = collectAppUIPluginLocations(input.model).sort(
    (left, right) =>
      left.plugin.pluginId.localeCompare(right.plugin.pluginId) ||
      left.plugin.id.localeCompare(right.plugin.id),
  );
  const candidates: CreatorActionCandidate[] = [];
  const bindings = new Map<string, CreatorActionBinding>();
  const actionsPerTarget = new Map<string, number>();

  const addAction = (
    candidate: CreatorActionCandidate,
    binding: CreatorActionBinding,
  ): void => {
    if (candidates.length >= MAX_CREATOR_ACTION_CANDIDATES) {
      actionCatalogTooLarge(
        `Creator Action Catalog exceeds ${MAX_CREATOR_ACTION_CANDIDATES} candidates.`,
        { limit: MAX_CREATOR_ACTION_CANDIDATES },
      );
    }
    const key = candidateTargetKey(candidate.target);
    const count = (actionsPerTarget.get(key) ?? 0) + 1;
    if (count > MAX_CREATOR_ACTIONS_PER_TARGET) {
      actionCatalogTooLarge(
        `Creator Action target exceeds ${MAX_CREATOR_ACTIONS_PER_TARGET} candidates.`,
        {
          target: candidate.target,
          limit: MAX_CREATOR_ACTIONS_PER_TARGET,
        },
      );
    }
    if (bindings.has(candidate.actionId)) {
      actionCatalogInvalid(
        `Duplicate Creator Action id "${candidate.actionId}".`,
        { actionId: candidate.actionId },
      );
    }
    actionsPerTarget.set(key, count);
    candidates.push(candidate);
    bindings.set(candidate.actionId, binding);
  };

  // Add actions use the exact Host default-insertion planner. A selected and
  // enabled instance is represented as a semantic no-op; disabled-only
  // selections stay out of the Product Action catalog, matching execution.
  for (const asset of input.generation.assets) {
    if (!isVisualAsset(asset)) continue;
    const matchingInstances = locations.filter(
      ({ plugin }) => plugin.pluginId === asset.pluginId,
    );
    const enabledInstance = matchingInstances.find(({ plugin }) => plugin.enabled);
    if (enabledInstance !== undefined) {
      const target: CreatorActionTarget = {
        pluginId: asset.pluginId,
        pluginName: asset.name,
        instanceId: enabledInstance.plugin.id,
      };
      const effect: CreatorActionEffect = { type: "add_default" };
      const candidate = actionCandidate(
        "add_existing_plugin",
        "already_satisfied",
        target,
        effect,
        `Add ${asset.name}`,
        `Add the existing ${asset.name} Plugin using its default placement.`,
      );
      addAction(candidate, {
        actionId: candidate.actionId,
        status: "already_satisfied",
      });
      continue;
    }
    if (matchingInstances.length > 0) continue;

    const operation: Extract<CreatorActionOperation, { type: "insert_plugin_default" }> = {
      type: "insert_plugin_default",
      plugin: {
        id: `${asset.pluginId}-main`,
        pluginId: asset.pluginId,
        enabled: true,
      },
    };
    if (!(await validateCandidateBindingInMemory(input, operation))) continue;
    const target: CreatorActionTarget = {
      pluginId: asset.pluginId,
      pluginName: asset.name,
    };
    const effect: CreatorActionEffect = { type: "add_default" };
    const candidate = actionCandidate(
      "add_existing_plugin",
      "ready",
      target,
      effect,
      `Add ${asset.name}`,
      `Add the existing ${asset.name} Plugin using its default placement.`,
    );
    addAction(candidate, {
      actionId: candidate.actionId,
      status: "ready",
      operation,
    });
  }

  // Remove actions are generated only when the existing Host reflow planner
  // and a hypothetical full composition compile both accept the removal.
  for (const { plugin } of locations) {
    const asset = uniqueAsset(assetsByPluginId, plugin.pluginId);
    if (asset === undefined) continue;
    const operation: Extract<CreatorActionOperation, { type: "remove_plugin_default" }> = {
      type: "remove_plugin_default",
      instanceId: plugin.id,
    };
    if (!(await validateCandidateBindingInMemory(input, operation))) continue;
    const target: CreatorActionTarget = {
      pluginId: plugin.pluginId,
      pluginName: asset.name,
      instanceId: plugin.id,
    };
    const effect: CreatorActionEffect = { type: "remove" };
    const candidate = actionCandidate(
      "remove_plugin",
      "ready",
      target,
      effect,
      `Remove ${asset.name}`,
      `Remove the ${asset.name} Plugin instance from the current composition.`,
    );
    addAction(candidate, {
      actionId: candidate.actionId,
      status: "ready",
      operation,
    });
  }

  // An absent remove is a Plugin-level semantic no-op. It is deliberately
  // separate from the exact-instance action above and is not emitted for a
  // disabled instance: disabled still means the instance exists.
  for (const asset of input.generation.assets) {
    if (!isVisualAsset(asset)) continue;
    const matchingInstances = locations.filter(
      ({ plugin }) => plugin.pluginId === asset.pluginId,
    );
    if (matchingInstances.length > 0) continue;
    const target: CreatorActionTarget = {
      pluginId: asset.pluginId,
      pluginName: asset.name,
    };
    const effect: CreatorActionEffect = { type: "remove" };
    const candidate = actionCandidate(
      "remove_plugin",
      "already_satisfied",
      target,
      effect,
      `Remove ${asset.name}`,
      `Remove the ${asset.name} Plugin from the current composition.`,
    );
    addAction(candidate, {
      actionId: candidate.actionId,
      status: "already_satisfied",
    });
  }

  const contracts = pluginMoveContractsForGeneration(input.generation);
  const appendMoveAction = async (
    target: CreatorActionTarget,
    effect: CreatorActionEffect,
    operation: Extract<CreatorActionOperation, { type: "move_plugin_to" }>,
    label: string,
    description: string,
  ): Promise<void> => {
    let plan: ReturnType<typeof planPluginMove>;
    try {
      plan = planPluginMove(input.model, operation, contracts);
    } catch (error) {
      if (isExpectedCreatorActionRejection(error)) return;
      actionCatalogBuildFailed(
        "Creator Action move planning failed unexpectedly.",
        { cause: error instanceof Error ? error.message : String(error) },
      );
    }
    const status: CreatorActionStatus = plan.changed
      ? "ready"
      : "already_satisfied";
    if (status === "ready" && !(await validateCandidateBindingInMemory(input, operation))) {
      return;
    }
    const candidate = actionCandidate(
      "move_plugin",
      status,
      target,
      effect,
      label,
      description,
    );
    addAction(
      candidate,
      status === "ready"
        ? { actionId: candidate.actionId, status, operation }
        : { actionId: candidate.actionId, status },
    );
  };

  const appendAlreadySatisfiedMoveAction = (
    target: CreatorActionTarget,
    effect: CreatorActionEffect,
    label: string,
    description: string,
  ): void => {
    const candidate = actionCandidate(
      "move_plugin",
      "already_satisfied",
      target,
      effect,
      label,
      description,
    );
    addAction(candidate, {
      actionId: candidate.actionId,
      status: "already_satisfied",
    });
  };

  const rowRegions = visualRowRegions(input.model, locations, assetsByPluginId);
  const rowGroups = new Map<object, VisualRowRegion[]>();
  for (const region of rowRegions) {
    const group = rowGroups.get(region.region.parent) ?? [];
    group.push(region);
    rowGroups.set(region.region.parent, group);
  }
  for (const group of rowGroups.values()) {
    group.sort((left, right) => left.region.index - right.region.index);
  }

  // Row-edge actions intentionally keep their semantic identity independent
  // from the current lowering anchor. The binding below may therefore change
  // after a fresh Catalog rebuild without changing actionId.
  for (const group of rowGroups.values()) {
    for (const targetRegion of group) {
      const target: CreatorActionTarget = {
        pluginId: targetRegion.pluginId,
        pluginName: targetRegion.pluginName,
        instanceId: targetRegion.instanceId,
      };
      const first = group.find((candidate) => candidate.region.index === 0);
      const last = group.find(
        (candidate) => candidate.region.index === targetRegion.region.parent.children.length - 1,
      );
      if (targetRegion.region.index === 0) {
        appendAlreadySatisfiedMoveAction(
          target,
          { type: "row_edge", edge: "left" },
          `Move ${targetRegion.pluginName} to the current row's left edge`,
          `Move the ${targetRegion.pluginName} Plugin to the left edge of its current Row.`,
        );
      } else if (first !== undefined) {
        await appendMoveAction(
          target,
          { type: "row_edge", edge: "left" },
          pluginMoveOperation(targetRegion.instanceId, {
            type: "relative",
            anchorInstanceId: first.instanceId,
            relation: "before",
          }),
          `Move ${targetRegion.pluginName} to the current row's left edge`,
          `Move the ${targetRegion.pluginName} Plugin to the left edge of its current Row.`,
        );
      }

      if (targetRegion.region.index === targetRegion.region.parent.children.length - 1) {
        appendAlreadySatisfiedMoveAction(
          target,
          { type: "row_edge", edge: "right" },
          `Move ${targetRegion.pluginName} to the current row's right edge`,
          `Move the ${targetRegion.pluginName} Plugin to the right edge of its current Row.`,
        );
      } else if (last !== undefined) {
        await appendMoveAction(
          target,
          { type: "row_edge", edge: "right" },
          pluginMoveOperation(targetRegion.instanceId, {
            type: "relative",
            anchorInstanceId: last.instanceId,
            relation: "after",
          }),
          `Move ${targetRegion.pluginName} to the current row's right edge`,
          `Move the ${targetRegion.pluginName} Plugin to the right edge of its current Row.`,
        );
      }
    }

    for (const targetRegion of group) {
      for (const anchorRegion of group) {
        if (targetRegion.instanceId === anchorRegion.instanceId) continue;
        const target: CreatorActionTarget = {
          pluginId: targetRegion.pluginId,
          pluginName: targetRegion.pluginName,
          instanceId: targetRegion.instanceId,
        };
        for (const relation of ["before", "after"] as const) {
          await appendMoveAction(
            target,
            {
              type: "relative",
              anchorPluginId: anchorRegion.pluginId,
              anchorPluginName: anchorRegion.pluginName,
              anchorInstanceId: anchorRegion.instanceId,
              relation,
            },
            pluginMoveOperation(targetRegion.instanceId, {
              type: "relative",
              anchorInstanceId: anchorRegion.instanceId,
              relation,
            }),
            `Move ${targetRegion.pluginName} ${relation} ${anchorRegion.pluginName}`,
            `Move the ${targetRegion.pluginName} Plugin ${relation} the ${anchorRegion.pluginName} Plugin in the same Row.`,
          );
        }
      }
    }
  }

  // Plugin Slot actions use the existing Host move planner for capability,
  // cardinality, cycle, and source-reflow admission.
  for (const { plugin } of locations) {
    const targetAsset = uniqueAsset(assetsByPluginId, plugin.pluginId);
    if (targetAsset === undefined) continue;
    const target: CreatorActionTarget = {
      pluginId: plugin.pluginId,
      pluginName: targetAsset.name,
      instanceId: plugin.id,
    };
    for (const parentLocation of locations) {
      const parentAsset = uniqueAsset(assetsByPluginId, parentLocation.plugin.pluginId);
      if (parentAsset === undefined) continue;
      const slots = contracts.pluginSlots[parentLocation.plugin.pluginId] ?? {};
      for (const slot of Object.keys(slots).sort()) {
        const effect: CreatorActionEffect = {
          type: "plugin_slot",
          parentPluginId: parentLocation.plugin.pluginId,
          parentPluginName: parentAsset.name,
          parentInstanceId: parentLocation.plugin.id,
          slot,
        };
        await appendMoveAction(
          target,
          effect,
          pluginMoveOperation(plugin.id, {
            type: "plugin_slot",
            parentInstanceId: parentLocation.plugin.id,
            slot,
          }),
          `Move ${targetAsset.name} into ${parentAsset.name}'s ${slot} Slot`,
          `Move the ${targetAsset.name} Plugin into the ${slot} Slot owned by ${parentAsset.name}.`,
        );
      }
    }
  }

  const revision = createHash("sha256")
    .update(
      JSON.stringify({
        appUIModelHash: input.appUIModelHash,
        candidates,
      }),
    )
    .digest("hex");

  return {
    appUIModelHash: input.appUIModelHash,
    revision,
    candidates,
    bindings,
  };
}
