import {
  buildLayoutRefIndex,
  collectAppUIPluginLocations,
  type AppUIColumnNode,
  type AppUILayoutNode,
  type AppUIModel,
  type AppUIPluginNode,
  type AppUIRowNode,
} from "../../framework/contracts/app-ui-model";
import type {
  AppUIOperation,
  AppUIPluginMoveContracts,
} from "./app-ui-operations";
import { assertPluginSlotDestination } from "./app-ui-operations";
import type { PluginDefaultPlacement } from "../../framework/contracts/ui-plugin";
import {
  WORKSPACE_REGIONS,
  type AgentUIWorkspacePolicy,
  type WorkspaceRegion,
} from "../../framework/contracts/agent-ui-workspace";
import { projectWorkspaceTopology } from "./workspace-topology";
import type {
  GeneratePluginCatalogResult,
  PluginAsset,
} from "./types";

export class CreatorActionPlanningError extends Error {
  readonly code: string;
  readonly details: unknown;

  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.name = "CreatorActionPlanningError";
    this.code = code;
    this.details = details;
  }
}

type SemanticPlacementRelation = "before" | "after" | "above" | "below";

type VisualRegionResolution =
  | {
      mode: "existing-axis-parent";
      anchorRef: string;
      parentRef: string;
      parent: AppUIRowNode | AppUIColumnNode;
    }
  | {
      mode: "root-anchor";
      anchorRef: string;
      anchorSize: string;
      anchor: AppUILayoutNode;
    };

export interface DefaultPluginInsertionPlan {
  operations: AppUIOperation[];
  expectedGeometry?: {
    instanceId: string;
    anchorInstanceId: string;
    relation: SemanticPlacementRelation;
    axis: "width" | "height";
    size: string;
  };
  expectedPlacement?: {
    type: "plugin_slot";
    instanceId: string;
    parentInstanceId: string;
    slot: string;
  };
}

export interface WorkspaceRegionInsertionPlan {
  operations: AppUIOperation[];
  instanceId: string;
  region: WorkspaceRegion;
  trackIndex: number;
}

/** The default topology identifies the Plugin's domain, never its requested destination. */
export function isWorkspaceCompatibleAsset(
  model: AppUIModel,
  asset: PluginAsset,
  generation: GeneratePluginCatalogResult,
  policy: AgentUIWorkspacePolicy,
): boolean {
  const placement = asset.authoring?.defaultPlacement;
  if (!isVisualAsset(asset) || placement?.type !== "relative") return false;
  const anchors = collectAppUIPluginLocations(model).filter(
    ({ plugin }) => plugin.pluginId === placement.anchorPluginId && plugin.enabled,
  );
  if (anchors.length !== 1) return false;
  const anchorAsset = generation.assets.filter(
    (candidate) => candidate.pluginId === placement.anchorPluginId,
  );
  if (anchorAsset.length !== 1 || !isVisualAsset(anchorAsset[0])) return false;
  try {
    const visual = resolveVisualRegion(model, anchors[0]!.plugin.id, placement.relation, anchorAsset[0]!);
    const topology = projectWorkspaceTopology(model, policy);
    if (visual.mode !== "existing-axis-parent" || visual.parent !== topology.root) return false;
    const anchorBranch = topology.root.children.find(
      (branch) => visual.anchorRef === buildLayoutRefIndex(model.root).byNode.get(branch),
    );
    return WORKSPACE_REGIONS.some((region) => topology.regions[region]?.branch === anchorBranch);
  } catch (error) {
    if (error instanceof CreatorActionPlanningError ||
      (typeof error === "object" && error !== null && "code" in error && error.code === "WORKSPACE_TOPOLOGY_UNSUPPORTED")) return false;
    throw error;
  }
}

export function planWorkspaceRegionInsertion(
  model: AppUIModel,
  plugin: AppUIPluginNode,
  region: WorkspaceRegion,
  generation: GeneratePluginCatalogResult,
  policy: AgentUIWorkspacePolicy,
): WorkspaceRegionInsertionPlan {
  const asset = generation.assets.find((candidate) => candidate.pluginId === plugin.pluginId);
  const topology = projectWorkspaceTopology(model, policy);
  const destination = policy.regions[region];
  if (asset === undefined || !isWorkspaceCompatibleAsset(model, asset, generation, policy) ||
      destination === undefined || topology.regions[region] !== undefined ||
      typeof destination.track !== "string" || !plugin.enabled ||
      serviceReadinessForAsset(asset, generation).status === "unresolved" ||
      collectAppUIPluginLocations(model).some(({ plugin: selected }) =>
        selected.pluginId === plugin.pluginId || selected.id === plugin.id)) {
    throw new CreatorActionPlanningError(
      "WORKSPACE_INSERT_UNAVAILABLE",
      `Plugin "${plugin.pluginId}" cannot be inserted into Workspace.${region}.`,
    );
  }
  const destinationOrder = WORKSPACE_REGIONS.indexOf(region);
  const trackIndex = WORKSPACE_REGIONS.filter((candidate) => {
    const occupied = topology.regions[candidate];
    return occupied !== undefined && WORKSPACE_REGIONS.indexOf(candidate) < destinationOrder;
  }).length;
  const panel = {
    type: "panel" as const,
    child: { type: "slot" as const, plugins: [structuredClone(plugin)] },
  };
  return {
    instanceId: plugin.id,
    region,
    trackIndex,
    operations: [
      { type: "insert_layout_node", parentRef: topology.rootRef, node: panel,
        index: trackIndex, size: destination.track },
      ...topology.root.children.flatMap((branch) => {
        const nodeRef = buildLayoutRefIndex(model.root).byNode.get(branch);
        return branch.type === "panel" && branch.width !== undefined && nodeRef !== undefined
          ? [{ type: "update_layout_node_props" as const, nodeRef, removeKeys: ["width"] }]
          : [];
      }),
    ],
  };
}

function semanticPlacementError(
  code:
    | "AUTHORING_DEFAULT_PLACEMENT_UNAVAILABLE"
    | "AUTHORING_DEFAULT_PLACEMENT_AMBIGUOUS"
    | "AUTHORING_DEFAULT_PLACEMENT_UNSUPPORTED",
  message: string,
  details?: unknown,
): never {
  throw new CreatorActionPlanningError(code, message, details);
}

export function isVisualAsset(asset: PluginAsset | undefined): asset is PluginAsset {
  return (
    asset !== undefined &&
    asset.applicationGate === undefined &&
    asset.manifest.data?.messageUI !== true &&
    !asset.capabilities.includes("headless")
  );
}

function normalizeAuthoringTrackSize(
  value: unknown,
  options: {
    pluginId: string;
    axis: "width" | "height";
  },
): string {
  const { pluginId, axis } = options;
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value <= 0) {
      semanticPlacementError(
        "AUTHORING_DEFAULT_PLACEMENT_UNSUPPORTED",
        `Plugin "${pluginId}" does not declare a positive ${axis} for an authoring-default region.`,
        { pluginId, axis, value },
      );
    }
    return `${value}px`;
  }

  if (typeof value !== "string") {
    semanticPlacementError(
      "AUTHORING_DEFAULT_PLACEMENT_UNAVAILABLE",
      `Plugin "${pluginId}" does not declare a usable ${axis} for its authoring-default placement.`,
      { pluginId, axis },
    );
  }

  const normalized = value.trim();
  if (
    !normalized ||
    /^\s*[+-]?(?:\d+(?:\.\d*)?|\.\d+)\s*$/u.test(normalized) ||
    /(?:^|\s)(?:auto|fit-content|max-content|min-content)(?:$|\s)/iu.test(
      normalized,
    )
  ) {
    semanticPlacementError(
      "AUTHORING_DEFAULT_PLACEMENT_UNSUPPORTED",
      `Plugin "${pluginId}" does not declare a fixed ${axis} suitable for a dedicated authoring-default region.`,
      { pluginId, axis, value },
    );
  }
  return normalized;
}

function resolveRootAnchorTrackSize(
  branch: AppUILayoutNode,
  anchorAsset: PluginAsset,
  axis: "width" | "height",
): string {
  const currentPanelSize = branch.type === "panel"
    ? branch[axis]
    : undefined;
  if (currentPanelSize !== undefined) {
    return normalizeAuthoringTrackSize(currentPanelSize, {
      pluginId: anchorAsset.pluginId,
      axis,
    });
  }

  const recommendedSize = anchorAsset.authoring?.recommendedSize?.[axis];
  if (recommendedSize === undefined) {
    semanticPlacementError(
      "AUTHORING_DEFAULT_PLACEMENT_UNSUPPORTED",
      `Anchor Plugin "${anchorAsset.pluginId}" does not provide a deterministic ${axis} for a root authoring-default region.`,
      { anchorPluginId: anchorAsset.pluginId, axis },
    );
  }
  return normalizeAuthoringTrackSize(recommendedSize, {
    pluginId: anchorAsset.pluginId,
    axis,
  });
}

function resolveVisualRegion(
  model: AppUIModel,
  anchorInstanceId: string,
  relation: SemanticPlacementRelation,
  anchorAsset: PluginAsset,
): VisualRegionResolution {
  const location = collectAppUIPluginLocations(model).find(
    ({ plugin }) => plugin.id === anchorInstanceId,
  );
  if (location === undefined || location.target.type !== "layout_slot") {
    semanticPlacementError(
      "AUTHORING_DEFAULT_PLACEMENT_UNSUPPORTED",
      `Anchor Plugin instance "${anchorInstanceId}" is not a direct visual Layout instance.`,
      { anchorInstanceId },
    );
  }

  const refs = buildLayoutRefIndex(model.root);
  const slotPath = location.target.slotPath;
  const slotEntry = refs.entries.find(
    (entry) => entry.path === slotPath,
  );
  if (slotEntry === undefined || slotEntry.node.type !== "slot") {
    semanticPlacementError(
      "AUTHORING_DEFAULT_PLACEMENT_UNSUPPORTED",
      `Anchor Plugin instance "${anchorInstanceId}" does not resolve to a Layout Slot.`,
      { anchorInstanceId },
    );
  }
  if (slotEntry.node.plugins.length !== 1) {
    semanticPlacementError(
      "AUTHORING_DEFAULT_PLACEMENT_UNSUPPORTED",
      `Anchor region for "${anchorInstanceId}" is shared by multiple Layout Plugins.`,
      { anchorInstanceId, pluginCount: slotEntry.node.plugins.length },
    );
  }

  let branch: AppUILayoutNode = slotEntry.node;
  let entry = slotEntry;
  while (entry.parentKind === "panel" && entry.parent?.type === "panel") {
    branch = entry.parent;
    const parentEntry = refs.entries.find((candidate) => candidate.node === branch);
    if (parentEntry === undefined) {
      semanticPlacementError(
        "AUTHORING_DEFAULT_PLACEMENT_UNSUPPORTED",
        `Anchor region for "${anchorInstanceId}" is detached from the Layout tree.`,
        { anchorInstanceId },
      );
    }
    entry = parentEntry;
  }

  const expectedParentType = relation === "above" || relation === "below"
    ? "column"
    : "row";
  const axis = relation === "above" || relation === "below"
    ? "height"
    : "width";
  const anchorRef = refs.byNode.get(branch);
  if (anchorRef === undefined) {
    semanticPlacementError(
      "AUTHORING_DEFAULT_PLACEMENT_UNSUPPORTED",
      `Anchor region for "${anchorInstanceId}" has no stable authoring reference.`,
      { anchorInstanceId },
    );
  }

  if (entry.parentKind === "root") {
    return {
      mode: "root-anchor",
      anchorRef,
      anchorSize: resolveRootAnchorTrackSize(branch, anchorAsset, axis),
      anchor: branch,
    };
  }

  if (
    entry.parentKind !== "children" ||
    entry.parent === undefined ||
    entry.index === undefined ||
    entry.parent.type !== expectedParentType
  ) {
    semanticPlacementError(
      "AUTHORING_DEFAULT_PLACEMENT_UNSUPPORTED",
      `Anchor region for "${anchorInstanceId}" is not a direct child of a supported ${expectedParentType}.`,
      {
        anchorInstanceId,
        expectedParentType,
        actualParentType: entry.parent?.type,
        parentKind: entry.parentKind,
      },
    );
  }

  const parentRef = refs.byNode.get(entry.parent);
  if (parentRef === undefined) {
    semanticPlacementError(
      "AUTHORING_DEFAULT_PLACEMENT_UNSUPPORTED",
      `Anchor region for "${anchorInstanceId}" has no stable authoring reference.`,
      { anchorInstanceId },
    );
  }

  return {
    mode: "existing-axis-parent",
    anchorRef,
    parentRef,
    parent: entry.parent,
  };
}

function serviceReadinessForAsset(
  asset: PluginAsset,
  generation: GeneratePluginCatalogResult,
): { status: "resolved" | "not-required" | "unresolved"; missing: string[] } {
  const declaration = generation.serviceDependencies.plugins.find(
    (candidate) => candidate.pluginId === asset.pluginId,
  );
  if (declaration === undefined) {
    return { status: "unresolved", missing: [] };
  }
  if (declaration.inject.length === 0) {
    return { status: "not-required", missing: [] };
  }
  const services = new Map(
    generation.serviceDependencies.services.map((service) => [service.name, service.status]),
  );
  const missing = declaration.inject.filter(
    (name) => services.get(name) !== "available",
  );
  return {
    status: missing.length === 0 ? "resolved" : "unresolved",
    missing,
  };
}

export function planDefaultPluginInsertion(
  model: AppUIModel,
  operation: Extract<AppUIOperation, { type: "insert_plugin_default" }>,
  generation: GeneratePluginCatalogResult,
): DefaultPluginInsertionPlan {
  const assetMatches = generation.assets.filter(
    (asset) => asset.pluginId === operation.plugin.pluginId,
  );
  if (assetMatches.length === 0) {
    semanticPlacementError(
      "AUTHORING_DEFAULT_PLACEMENT_UNAVAILABLE",
      `No existing UI Plugin asset matches "${operation.plugin.pluginId}".`,
      { pluginId: operation.plugin.pluginId },
    );
  }
  if (assetMatches.length !== 1) {
    semanticPlacementError(
      "AUTHORING_DEFAULT_PLACEMENT_AMBIGUOUS",
      `UI Plugin asset "${operation.plugin.pluginId}" is not uniquely resolvable.`,
      { pluginId: operation.plugin.pluginId, matches: assetMatches.map((asset) => asset.manifestPath) },
    );
  }
  const asset = assetMatches[0]!;
  if (!isVisualAsset(asset) || operation.plugin.enabled !== true) {
    semanticPlacementError(
      "AUTHORING_DEFAULT_PLACEMENT_UNSUPPORTED",
      `UI Plugin "${operation.plugin.pluginId}" is not an enabled visual asset eligible for authoring-default insertion.`,
      { pluginId: operation.plugin.pluginId },
    );
  }
  if (collectAppUIPluginLocations(model).some(({ plugin }) => plugin.pluginId === asset.pluginId)) {
    semanticPlacementError(
      "AUTHORING_DEFAULT_PLACEMENT_UNAVAILABLE",
      `UI Plugin "${asset.pluginId}" is already selected in the current Composition.`,
      { pluginId: asset.pluginId },
    );
  }
  if (collectAppUIPluginLocations(model).some(({ plugin }) => plugin.id === operation.plugin.id)) {
    semanticPlacementError(
      "AUTHORING_DEFAULT_PLACEMENT_AMBIGUOUS",
      `Plugin instance "${operation.plugin.id}" already exists in the current Composition.`,
      { instanceId: operation.plugin.id },
    );
  }

  const placement = asset.authoring?.defaultPlacement;
  if (placement === undefined) {
    semanticPlacementError(
      "AUTHORING_DEFAULT_PLACEMENT_UNAVAILABLE",
      `UI Plugin "${asset.pluginId}" does not declare an authoring-default placement.`,
      { pluginId: asset.pluginId },
    );
  }
  const readiness = serviceReadinessForAsset(asset, generation);
  if (readiness.status === "unresolved") {
    semanticPlacementError(
      "AUTHORING_DEFAULT_PLACEMENT_UNAVAILABLE",
      `UI Plugin "${asset.pluginId}" has unresolved required Services.`,
      { pluginId: asset.pluginId, missingRequiredServices: readiness.missing },
    );
  }

  if (placement.type === "plugin_slot") {
    return planPluginSlotInsertion(model, operation, generation, placement);
  }
  return planRelativeInsertion(model, operation, generation, asset, placement);
}

function planPluginSlotInsertion(
  model: AppUIModel,
  operation: Extract<AppUIOperation, { type: "insert_plugin_default" }>,
  generation: GeneratePluginCatalogResult,
  placement: Extract<PluginDefaultPlacement, { type: "plugin_slot" }>,
): DefaultPluginInsertionPlan {
  const parents = collectAppUIPluginLocations(model).filter(
    ({ plugin }) => plugin.pluginId === placement.parentPluginId && plugin.enabled,
  );
  if (parents.length !== 1) {
    semanticPlacementError(
      parents.length === 0 ? "AUTHORING_DEFAULT_PLACEMENT_UNAVAILABLE" : "AUTHORING_DEFAULT_PLACEMENT_AMBIGUOUS",
      `Authoring-default parent "${placement.parentPluginId}" does not resolve to exactly one enabled instance.`,
      { parentPluginId: placement.parentPluginId, matchingInstanceIds: parents.map(({ plugin }) => plugin.id) },
    );
  }
  const parent = parents[0]!.plugin;
  assertPluginSlotDestination(
    parent, placement.slot, operation.plugin.pluginId, operation.plugin.id,
    pluginMoveContractsForGeneration(generation),
  );
  return {
    operations: [{
      type: "insert_plugin",
      plugin: structuredClone(operation.plugin),
      target: { type: "plugin_slot", parentInstanceId: parent.id, slot: placement.slot },
    }],
    expectedPlacement: {
      type: "plugin_slot",
      instanceId: operation.plugin.id,
      parentInstanceId: parent.id,
      slot: placement.slot,
    },
  };
}

function planRelativeInsertion(
  model: AppUIModel,
  operation: Extract<AppUIOperation, { type: "insert_plugin_default" }>,
  generation: GeneratePluginCatalogResult,
  asset: PluginAsset,
  placement: Extract<PluginDefaultPlacement, { type: "relative" }>,
): DefaultPluginInsertionPlan {
  const anchorMatches = collectAppUIPluginLocations(model).filter(
    ({ plugin }) => plugin.pluginId === placement.anchorPluginId && plugin.enabled,
  );
  if (anchorMatches.length !== 1) {
    semanticPlacementError(
      "AUTHORING_DEFAULT_PLACEMENT_AMBIGUOUS",
      `Authoring-default anchor "${placement.anchorPluginId}" does not resolve to exactly one enabled instance.`,
      {
        anchorPluginId: placement.anchorPluginId,
        matchingInstanceIds: anchorMatches.map(({ plugin }) => plugin.id),
      },
    );
  }
  const anchor = anchorMatches[0]!;
  const anchorAssetMatches = generation.assets.filter(
    (candidate) => candidate.pluginId === anchor.plugin.pluginId,
  );
  if (anchorAssetMatches.length !== 1) {
    semanticPlacementError(
      "AUTHORING_DEFAULT_PLACEMENT_UNSUPPORTED",
      `Authoring-default anchor "${placement.anchorPluginId}" is not a uniquely resolvable visual asset.`,
      { anchorPluginId: placement.anchorPluginId },
    );
  }
  const anchorAsset = anchorAssetMatches[0];
  if (!isVisualAsset(anchorAsset)) {
    semanticPlacementError(
      "AUTHORING_DEFAULT_PLACEMENT_UNSUPPORTED",
      `Authoring-default anchor "${placement.anchorPluginId}" is not a uniquely resolvable visual asset.`,
      { anchorPluginId: placement.anchorPluginId },
    );
  }

  const axis = placement.relation === "above" || placement.relation === "below"
    ? "height"
    : "width";
  const trackSize = normalizeAuthoringTrackSize(
    asset.authoring?.recommendedSize?.[axis],
    { pluginId: asset.pluginId, axis },
  );
  const region = resolveVisualRegion(
    model,
    anchor.plugin.id,
    placement.relation,
    anchorAsset,
  );
  if (
    region.mode === "existing-axis-parent" &&
    region.parent.sizes !== undefined &&
    region.parent.sizes.length !== region.parent.children.length
  ) {
    semanticPlacementError(
      "AUTHORING_DEFAULT_PLACEMENT_UNSUPPORTED",
      "The anchor Row/Column has an invalid child-to-track relationship.",
      { parentRef: region.parentRef },
    );
  }

  const direction = placement.relation === "before"
    ? "left"
    : placement.relation === "after"
      ? "right"
      : placement.relation;
  const panel = {
    type: "panel" as const,
    child: {
      type: "slot" as const,
      plugins: [structuredClone(operation.plugin) as AppUIPluginNode],
    },
  };
  const loweredOperations: AppUIOperation[] = [];
  if (
    region.mode === "root-anchor" &&
    region.anchor.type === "panel" &&
    region.anchor[axis] !== undefined
  ) {
    loweredOperations.push({
      type: "update_layout_node_props",
      nodeRef: region.anchorRef,
      removeKeys: [axis],
    });
  }
  if (region.mode === "existing-axis-parent" && region.parent.sizes === undefined) {
    loweredOperations.push({
      type: "update_layout_node_props",
      nodeRef: region.parentRef,
      set: {
        sizes: region.parent.children.map(() => "minmax(0, 1fr)"),
      },
    });
  }
  loweredOperations.push({
    type: "insert_layout_relative",
    anchorRef: region.anchorRef,
    direction,
    node: panel,
    size: trackSize,
    ...(region.mode === "root-anchor" ? { anchorSize: region.anchorSize } : {}),
  });

  return {
    operations: loweredOperations,
    expectedGeometry: {
      instanceId: operation.plugin.id,
      anchorInstanceId: anchor.plugin.id,
      relation: placement.relation,
      axis,
      size: trackSize,
    },
  };
}

export function pluginMoveContractsForGeneration(
  generation: GeneratePluginCatalogResult,
): AppUIPluginMoveContracts {
  return {
    pluginCapabilities: new Map(
      generation.assets.map((asset) => [asset.pluginId, asset.capabilities] as const),
    ),
    pluginSlots: generation.activeComposition.slotCatalog,
  };
}
