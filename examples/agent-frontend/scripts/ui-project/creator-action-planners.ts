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
    };

export interface DefaultPluginInsertionPlan {
  operations: AppUIOperation[];
  expectedGeometry: {
    instanceId: string;
    anchorInstanceId: string;
    relation: SemanticPlacementRelation;
    axis: "width" | "height";
    size: string;
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
  const slotEntry = refs.entries.find(
    (entry) => entry.path === location.target.slotPath,
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

  const placement = asset.authoring?.typicalPlacement;
  if (placement === undefined) {
    semanticPlacementError(
      "AUTHORING_DEFAULT_PLACEMENT_UNAVAILABLE",
      `UI Plugin "${asset.pluginId}" does not declare an authoring-default placement.`,
      { pluginId: asset.pluginId },
    );
  }
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

  const readiness = serviceReadinessForAsset(asset, generation);
  if (readiness.status === "unresolved") {
    semanticPlacementError(
      "AUTHORING_DEFAULT_PLACEMENT_UNAVAILABLE",
      `UI Plugin "${asset.pluginId}" has unresolved required Services.`,
      { pluginId: asset.pluginId, missingRequiredServices: readiness.missing },
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
  const panel: AppUILayoutNode = {
    type: "panel",
    ...(axis === "width" ? { width: trackSize } : { height: trackSize }),
    child: {
      type: "slot",
      plugins: [structuredClone(operation.plugin) as AppUIPluginNode],
    },
  };
  const loweredOperations: AppUIOperation[] = [];
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
