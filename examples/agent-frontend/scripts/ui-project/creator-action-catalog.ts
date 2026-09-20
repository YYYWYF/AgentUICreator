import { createHash } from "node:crypto";

import {
  collectAppUIPluginLocations,
  type AppUIModel,
} from "../../framework/contracts/app-ui-model";
import {
  applyAppUIOperations,
  lowerWorkspaceRegionMovePlan,
  planPluginMove,
  planWorkspaceRegionMove,
  resolveDefaultPluginRemovalReflow,
  resolvePluginMoveVisualRegion,
  type AppUIOperationApplyOptions,
  type PluginMoveVisualRegion,
  type AppUIOperation,
  type AppUIPluginMoveOperation,
  type CreatorWorkspaceRegionMoveBinding,
} from "./app-ui-operations";
import {
  WORKSPACE_REGIONS,
  type AgentUIWorkspacePolicy,
  type WorkspaceRegion,
  type WorkspaceTopology,
} from "../../framework/contracts/agent-ui-workspace";
import { projectWorkspaceTopology } from "./workspace-topology";
import {
  CreatorActionPlanningError,
  isVisualAsset,
  isWorkspaceCompatibleAsset,
  planDefaultPluginInsertion,
  planWorkspaceRegionInsertion,
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
  | {
      type: "add_default";
      /** The semantic domain of the Plugin's canonical default placement. */
      placementDomain?: "workspace" | "plugin_slot" | "relative";
    }
  | { type: "remove" }
  | {
      type: "relative";
      anchorPluginId: string;
      anchorPluginName: string;
      anchorInstanceId: string;
      relation: "before" | "after";
    }
  | { type: "row_edge"; edge: "left" | "right" }
  | { type: "workspace_region"; region: WorkspaceRegion }
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

export type CreatorPublicActionOperation = Extract<
  AppUIOperation,
  { type: "insert_plugin_default" | "remove_plugin_default" | "move_plugin_to" }
>;

export type CreatorActionBindingOperation =
  | CreatorPublicActionOperation
  | { type: "workspace_region_insert"; plugin: { id: string; pluginId: string; enabled: true }; region: WorkspaceRegion }
  | CreatorWorkspaceRegionMoveBinding;

type CreatorActionMoveOperation = Extract<
  CreatorActionBindingOperation,
  { type: "move_plugin_to" | "workspace_region_move" }
>;

export type CreatorActionBinding =
  | {
      actionId: string;
      status: "already_satisfied";
    }
  | {
      actionId: string;
      status: "ready";
      operation: CreatorActionBindingOperation;
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
  workspacePolicy: AgentUIWorkspacePolicy;
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
  region: PluginMoveVisualRegion;
  workspaceRegion: WorkspaceRegion;
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
      // placementDomain is a selector guard derived from the same canonical
      // default; it must not churn the stable semantic Add identity.
      return { type: effect.type };
    case "remove":
      return { type: effect.type };
    case "row_edge":
      return { type: effect.type, edge: effect.edge };
    case "workspace_region":
      return { type: effect.type, region: effect.region };
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
    code === "WORKSPACE_TOPOLOGY_UNSUPPORTED" ||
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

function addDefaultPlacementDomain(
  model: AppUIModel,
  asset: PluginAsset,
  generation: GeneratePluginCatalogResult,
  workspacePolicy: AgentUIWorkspacePolicy,
): "workspace" | "plugin_slot" | "relative" {
  const placement = asset.authoring?.defaultPlacement;
  if (placement?.type === "plugin_slot") return "plugin_slot";
  if (
    placement?.type === "relative" &&
    isWorkspaceCompatibleAsset(model, asset, generation, workspacePolicy)
  ) {
    return "workspace";
  }
  return "relative";
}

function addDefaultDescription(
  asset: PluginAsset,
  assetsByPluginId: ReadonlyMap<string, readonly PluginAsset[]>,
): string {
  const placement = asset.authoring?.defaultPlacement;
  if (placement?.type === "plugin_slot") {
    const parent = uniqueAsset(assetsByPluginId, placement.parentPluginId);
    const slot = parent?.childSlots?.[placement.slot];
    const parentName = parent?.name ?? placement.parentPluginId;
    const slotDescription = slot?.description ?? "the Plugin-owned semantic Slot";
    return `Add ${asset.name} to ${parentName}.${placement.slot} Slot, ${slotDescription}`;
  }
  if (placement?.type === "relative") {
    const anchor = uniqueAsset(assetsByPluginId, placement.anchorPluginId);
    return `Add ${asset.name} at its canonical ${placement.relation} placement relative to ${anchor?.name ?? placement.anchorPluginId}.`;
  }
  return `Add the existing ${asset.name} visual Plugin using its canonical default placement.`;
}

function pluginMoveOperation(
  instanceId: string,
  placement: AppUIPluginMoveOperation["placement"],
): Extract<CreatorPublicActionOperation, { type: "move_plugin_to" }> {
  return {
    type: "move_plugin_to",
    instanceId,
    placement,
  };
}

async function validateCandidateBindingInMemory(
  input: CreatorActionCatalogBuilderInput,
  operation: CreatorActionBindingOperation,
  workspaceTopology: WorkspaceTopology | undefined,
): Promise<boolean> {
  try {
    let afterModel: AppUIModel;
    let operationApplyOptions: AppUIOperationApplyOptions | undefined;

    switch (operation.type) {
      case "insert_plugin_default": {
        const plan = planDefaultPluginInsertion(
          input.model,
          operation,
          input.generation,
        );
        afterModel = applyAppUIOperations(input.model, plan.operations, {
          workspacePolicy: input.workspacePolicy,
        });
        break;
      }
      case "workspace_region_insert": {
        const plan = planWorkspaceRegionInsertion(
          input.model, operation.plugin, operation.region, input.generation, input.workspacePolicy,
        );
        afterModel = applyAppUIOperations(input.model, plan.operations, {
          workspacePolicy: input.workspacePolicy,
        });
        const afterTopology = projectWorkspaceTopology(afterModel, input.workspacePolicy);
        const occupancy = afterTopology.regions[operation.region];
        if (occupancy?.index !== plan.trackIndex || occupancy.branch.type !== "panel" ||
            occupancy.branch.child.type !== "slot" ||
            !occupancy.branch.child.plugins.some((plugin) => plugin.id === operation.plugin.id)) return false;
        break;
      }
      case "remove_plugin_default":
        resolveDefaultPluginRemovalReflow(
          input.model,
          operation.instanceId,
          input.workspacePolicy,
        );
        afterModel = applyAppUIOperations(input.model, [operation], {
          workspacePolicy: input.workspacePolicy,
        });
        break;
      case "workspace_region_move": {
        const plan = planWorkspaceRegionMove(
          input.model,
          operation,
          input.workspacePolicy,
        );
        afterModel = applyAppUIOperations(
          input.model,
          lowerWorkspaceRegionMovePlan(plan),
          { workspacePolicy: input.workspacePolicy },
        );
        break;
      }
      case "move_plugin_to": {
        const pluginMoveContracts = pluginMoveContractsForGeneration(
          input.generation,
        );
        planPluginMove(
          input.model,
          operation,
          pluginMoveContracts,
        );
        operationApplyOptions = {
          pluginMoveContracts,
          workspacePolicy: input.workspacePolicy,
        };
        afterModel = applyAppUIOperations(
          input.model,
          [operation],
          operationApplyOptions,
        );
        break;
      }
    }

    if (workspaceTopology !== undefined) {
      projectWorkspaceTopology(afterModel, input.workspacePolicy);
    }

    const nextGeneration = generatePluginRegistryFromFacts(
      afterModel,
      input.projectFacts,
    );
    if (nextGeneration.errors.length === 0) return true;

    // The baseline generation is checked before candidate enumeration. An
    // error introduced only by this hypothetical afterModel is a known
    // candidate-specific rejection, even when it came from the shared facts
    // snapshot (for example, a selected Plugin definition issue). Keep the
    // Catalog alive and omit only this binding. Unexpected exceptions still
    // escape through the catch below as Catalog build failures.
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
  topology: WorkspaceTopology,
): VisualRowRegion[] {
  return locations
    .flatMap(({ plugin }) => {
      const asset = uniqueAsset(assetsByPluginId, plugin.pluginId);
      if (!isVisualAsset(asset)) return [];
      try {
        const region = resolvePluginMoveVisualRegion(model, plugin.id);
        if (region.parent !== topology.root) return [];
        const workspaceRegion = WORKSPACE_REGIONS.find(
          (candidate) => topology.regions[candidate]?.branch === region.branch,
        );
        if (workspaceRegion === undefined) return [];
        return [{
          instanceId: plugin.id,
          pluginId: plugin.pluginId,
          pluginName: asset.name,
          region,
          workspaceRegion,
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
  let workspaceTopology: WorkspaceTopology | undefined;
  try {
    workspaceTopology = projectWorkspaceTopology(
      input.model,
      input.workspacePolicy,
    );
  } catch (error) {
    if (!isExpectedCreatorActionRejection(error)) {
      actionCatalogBuildFailed(
        "Creator Action Workspace topology discovery failed unexpectedly.",
        { cause: error instanceof Error ? error.message : String(error) },
      );
    }
  }

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
    if (!isVisualAsset(asset) || asset.authoring?.defaultPlacement === undefined) continue;
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
      const effect: CreatorActionEffect = {
        type: "add_default",
        placementDomain: addDefaultPlacementDomain(
          input.model,
          asset,
          input.generation,
          input.workspacePolicy,
        ),
      };
      const candidate = actionCandidate(
        "add_existing_plugin",
        "already_satisfied",
        target,
        effect,
        `Add ${asset.name}`,
        addDefaultDescription(asset, assetsByPluginId),
      );
      addAction(candidate, {
        actionId: candidate.actionId,
        status: "already_satisfied",
      });
      continue;
    }
    if (matchingInstances.length > 0) continue;

    const operation: Extract<CreatorPublicActionOperation, { type: "insert_plugin_default" }> = {
      type: "insert_plugin_default",
      plugin: {
        id: `${asset.pluginId}-main`,
        pluginId: asset.pluginId,
        enabled: true,
      },
    };
    const defaultValid = await validateCandidateBindingInMemory(input, operation, workspaceTopology);
    const target: CreatorActionTarget = {
      pluginId: asset.pluginId,
      pluginName: asset.name,
    };
    const effect: CreatorActionEffect = {
      type: "add_default",
      placementDomain: addDefaultPlacementDomain(
        input.model,
        asset,
        input.generation,
        input.workspacePolicy,
      ),
    };
    if (defaultValid) {
      const candidate = actionCandidate(
        "add_existing_plugin", "ready", target, effect,
        `Add ${asset.name}`,
        addDefaultDescription(asset, assetsByPluginId),
      );
      addAction(candidate, { actionId: candidate.actionId, status: "ready", operation });
    }
    if (workspaceTopology !== undefined && isWorkspaceCompatibleAsset(
      input.model, asset, input.generation, input.workspacePolicy,
    )) {
      for (const region of WORKSPACE_REGIONS) {
        if (input.workspacePolicy.regions[region] === undefined || workspaceTopology.regions[region] !== undefined) continue;
        const explicitOperation: CreatorActionBindingOperation = {
          type: "workspace_region_insert", plugin: { ...operation.plugin, enabled: true }, region,
        };
        if (!(await validateCandidateBindingInMemory(input, explicitOperation, workspaceTopology))) continue;
        const label = `Workspace.${region[0]!.toUpperCase()}${region.slice(1)}`;
        const explicitEffect: CreatorActionEffect = { type: "workspace_region", region };
        const candidate = actionCandidate(
          "add_existing_plugin", "ready", target, explicitEffect,
          `Add ${asset.name} to ${label}`,
          `Add the existing ${asset.name} visual Plugin to the explicit ${label} Region.`,
        );
        addAction(candidate, { actionId: candidate.actionId, status: "ready", operation: explicitOperation });
      }
    }
  }

  // Remove actions are generated only when the existing Host reflow planner
  // and a hypothetical full composition compile both accept the removal.
  for (const { plugin } of locations) {
    const asset = uniqueAsset(assetsByPluginId, plugin.pluginId);
    if (!isVisualAsset(asset)) continue;
    const operation: Extract<CreatorPublicActionOperation, { type: "remove_plugin_default" }> = {
      type: "remove_plugin_default",
      instanceId: plugin.id,
    };
    if (!(await validateCandidateBindingInMemory(input, operation, workspaceTopology))) continue;
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
      `Remove only the ${asset.name} visual Plugin instance from the UI composition. Underlying services and data are not removed.`,
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
      `Remove only the ${asset.name} visual Plugin from the UI composition. Underlying services and data are not removed.`,
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
    operation: CreatorActionMoveOperation,
    label: string,
    description: string,
  ): Promise<void> => {
    let changed: boolean;
    try {
      changed = operation.type === "workspace_region_move"
        ? planWorkspaceRegionMove(
            input.model,
            operation,
            input.workspacePolicy,
          ).changed
        : planPluginMove(input.model, operation, contracts).changed;
    } catch (error) {
      if (isExpectedCreatorActionRejection(error)) return;
      actionCatalogBuildFailed(
        "Creator Action move planning failed unexpectedly.",
        { cause: error instanceof Error ? error.message : String(error) },
      );
    }
    const status: CreatorActionStatus = changed
      ? "ready"
      : "already_satisfied";
    if (status === "ready" && !(await validateCandidateBindingInMemory(input, operation, workspaceTopology))) {
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

  if (workspaceTopology !== undefined) {
    const workspaceRegions = visualRowRegions(
      input.model,
      locations,
      assetsByPluginId,
      workspaceTopology,
    );
    for (const targetRegion of workspaceRegions) {
      const target: CreatorActionTarget = {
        pluginId: targetRegion.pluginId,
        pluginName: targetRegion.pluginName,
        instanceId: targetRegion.instanceId,
      };
      const currentEffect: CreatorActionEffect = {
        type: "workspace_region",
        region: targetRegion.workspaceRegion,
      };
      const currentRegionLabel =
        targetRegion.workspaceRegion.charAt(0).toUpperCase() +
        targetRegion.workspaceRegion.slice(1);
      appendAlreadySatisfiedMoveAction(
        target,
        currentEffect,
        `Move ${targetRegion.pluginName} to Workspace.${currentRegionLabel}`,
        `Move the ${targetRegion.pluginName} Plugin to the current Workspace.${currentRegionLabel} Region.`,
      );

      for (const destinationRegion of WORKSPACE_REGIONS) {
        if (destinationRegion === targetRegion.workspaceRegion) continue;
        if (input.workspacePolicy.regions[destinationRegion] === undefined) continue;
        if (workspaceTopology.regions[destinationRegion] !== undefined) continue;
        const destinationLabel =
          destinationRegion.charAt(0).toUpperCase() + destinationRegion.slice(1);
        await appendMoveAction(
          target,
          { type: "workspace_region", region: destinationRegion },
          {
            type: "workspace_region_move",
            instanceId: targetRegion.instanceId,
            region: destinationRegion,
          },
          `Move ${targetRegion.pluginName} to Workspace.${destinationLabel}`,
          `Move the ${targetRegion.pluginName} Plugin to the semantic Workspace.${destinationLabel} Region.`,
        );
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
