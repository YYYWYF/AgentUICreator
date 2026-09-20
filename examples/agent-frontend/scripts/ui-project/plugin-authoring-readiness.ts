import type { PluginChildSlotDefinition } from "../../framework/contracts/app-ui-composition";
import type { PluginDefaultPlacement } from "../../framework/contracts/ui-plugin";
import type {
  PluginAsset,
  PluginAuthoringReadiness,
  PluginCreatorReadiness,
  ProjectIssue,
} from "./types";

const CREATOR_ADD_RESTORE_UNAVAILABLE = "CREATOR_ADD_RESTORE_UNAVAILABLE";
const CREATOR_DEFAULT_PLACEMENT_ANCHOR_NOT_FOUND =
  "CREATOR_DEFAULT_PLACEMENT_ANCHOR_NOT_FOUND";
const CREATOR_DEFAULT_PLACEMENT_PARENT_NOT_FOUND =
  "CREATOR_DEFAULT_PLACEMENT_PARENT_NOT_FOUND";
const CREATOR_DEFAULT_PLACEMENT_PARENT_NOT_UNIQUE =
  "CREATOR_DEFAULT_PLACEMENT_PARENT_NOT_UNIQUE";
const CREATOR_DEFAULT_PLACEMENT_SLOT_NOT_FOUND =
  "CREATOR_DEFAULT_PLACEMENT_SLOT_NOT_FOUND";
const CREATOR_DEFAULT_PLACEMENT_CAPABILITY_MISMATCH =
  "CREATOR_DEFAULT_PLACEMENT_CAPABILITY_MISMATCH";
const CREATOR_DEFAULT_PLACEMENT_RENDERER_MODE_MISMATCH =
  "CREATOR_DEFAULT_PLACEMENT_RENDERER_MODE_MISMATCH";
const CREATOR_DEFAULT_PLACEMENT_SIZE_NOT_PORTABLE =
  "CREATOR_DEFAULT_PLACEMENT_SIZE_NOT_PORTABLE";

interface ReadinessDiagnostics {
  errors: ProjectIssue[];
  warnings: ProjectIssue[];
  reasons: string[];
}

function issue(
  code: string,
  message: string,
  pluginId: string,
): ProjectIssue {
  return { code, message, pluginId };
}

function addError(
  diagnostics: ReadinessDiagnostics,
  code: string,
  message: string,
  pluginId: string,
): void {
  diagnostics.errors.push(issue(code, message, pluginId));
  diagnostics.reasons.push(message);
}

function addWarning(
  diagnostics: ReadinessDiagnostics,
  code: string,
  message: string,
  pluginId: string,
): void {
  diagnostics.warnings.push(issue(code, message, pluginId));
  diagnostics.reasons.push(message);
}

function isNonVisualPlugin(asset: PluginAsset): boolean {
  return (
    asset.applicationGate !== undefined || asset.capabilities.includes("headless")
  );
}

function placementSizeAxis(
  placement: Extract<PluginDefaultPlacement, { type: "relative" }>,
): "width" | "height" {
  return placement.relation === "before" || placement.relation === "after"
    ? "width"
    : "height";
}

function validateRelativePlacement(
  asset: PluginAsset,
  placement: Extract<PluginDefaultPlacement, { type: "relative" }>,
  assetsById: ReadonlyMap<string, readonly PluginAsset[]>,
  diagnostics: ReadinessDiagnostics,
): void {
  const anchorMatches = assetsById.get(placement.anchorPluginId) ?? [];
  if (anchorMatches.length === 0) {
    addError(
      diagnostics,
      CREATOR_DEFAULT_PLACEMENT_ANCHOR_NOT_FOUND,
      `Plugin "${asset.pluginId}" defaultPlacement anchor "${placement.anchorPluginId}" does not identify a Plugin asset.`,
      asset.pluginId,
    );
  } else if (anchorMatches.length > 1) {
    addError(
      diagnostics,
      CREATOR_DEFAULT_PLACEMENT_ANCHOR_NOT_FOUND,
      `Plugin "${asset.pluginId}" defaultPlacement anchor "${placement.anchorPluginId}" is not unique.`,
      asset.pluginId,
    );
  }

  const axis = placementSizeAxis(placement);
  if (asset.authoring?.recommendedSize?.[axis] === undefined) {
    addWarning(
      diagnostics,
      CREATOR_DEFAULT_PLACEMENT_SIZE_NOT_PORTABLE,
      `Plugin "${asset.pluginId}" uses relative ${placement.relation} placement without recommendedSize.${axis}; Add may work in some layouts, but deterministic restore is not portable.`,
      asset.pluginId,
    );
  }

  if (asset.manifest.requiresRenderScope === true) {
    addError(
      diagnostics,
      CREATOR_DEFAULT_PLACEMENT_RENDERER_MODE_MISMATCH,
      `Plugin "${asset.pluginId}" requires render scope, so its defaultPlacement must target a renderer child Slot rather than a relative layout position.`,
      asset.pluginId,
    );
  }
}

function validatePluginSlotPlacement(
  asset: PluginAsset,
  placement: Extract<PluginDefaultPlacement, { type: "plugin_slot" }>,
  assetsById: ReadonlyMap<string, readonly PluginAsset[]>,
  diagnostics: ReadinessDiagnostics,
): void {
  const parentMatches = assetsById.get(placement.parentPluginId) ?? [];
  if (parentMatches.length === 0) {
    addError(
      diagnostics,
      CREATOR_DEFAULT_PLACEMENT_PARENT_NOT_FOUND,
      `Plugin "${asset.pluginId}" defaultPlacement parent Plugin "${placement.parentPluginId}" does not exist.`,
      asset.pluginId,
    );
    return;
  }
  if (parentMatches.length > 1) {
    addError(
      diagnostics,
      CREATOR_DEFAULT_PLACEMENT_PARENT_NOT_UNIQUE,
      `Plugin "${asset.pluginId}" defaultPlacement parent Plugin "${placement.parentPluginId}" is not unique.`,
      asset.pluginId,
    );
    return;
  }

  const parent = parentMatches[0]!;
  const slot = parent.childSlots?.[placement.slot];
  if (slot === undefined) {
    addError(
      diagnostics,
      CREATOR_DEFAULT_PLACEMENT_SLOT_NOT_FOUND,
      `Plugin "${asset.pluginId}" defaultPlacement targets child Slot "${placement.slot}" on Plugin "${parent.pluginId}", but that Slot is not declared.`,
      asset.pluginId,
    );
    return;
  }

  validateSlotCompatibility(asset, parent, placement.slot, slot, diagnostics);
}

function validateSlotCompatibility(
  asset: PluginAsset,
  parent: PluginAsset,
  slotName: string,
  slot: PluginChildSlotDefinition,
  diagnostics: ReadinessDiagnostics,
): void {
  const acceptedCapabilities = slot.accepts?.anyOfCapabilities ?? [];
  const capabilityMatches = acceptedCapabilities.some((capability) =>
    asset.capabilities.includes(capability),
  );
  if (!capabilityMatches) {
    addError(
      diagnostics,
      CREATOR_DEFAULT_PLACEMENT_CAPABILITY_MISMATCH,
      `Plugin "${asset.pluginId}" defaultPlacement targets child Slot "${slotName}" on Plugin "${parent.pluginId}", but no accepted capability matches its capabilities.`,
      asset.pluginId,
    );
  }

  const slotMode = slot.mode ?? "content";
  if (
    (asset.manifest.requiresRenderScope === true && slotMode !== "renderer") ||
    (asset.manifest.requiresRenderScope !== true && slotMode === "renderer")
  ) {
    addError(
      diagnostics,
      CREATOR_DEFAULT_PLACEMENT_RENDERER_MODE_MISMATCH,
      `Plugin "${asset.pluginId}" and child Slot "${slotName}" on Plugin "${parent.pluginId}" disagree about renderer mode.`,
      asset.pluginId,
    );
  }
}

function analyzeAsset(
  asset: PluginAsset,
  assetsById: ReadonlyMap<string, readonly PluginAsset[]>,
): {
  readiness: PluginCreatorReadiness;
  diagnostics: ReadinessDiagnostics;
} {
  if (isNonVisualPlugin(asset)) {
    return {
      readiness: {
        pluginId: asset.pluginId,
        status: "not-applicable",
        discoverable: false,
        addRestore: "not-applicable",
        reasons: [],
      },
      diagnostics: { errors: [], warnings: [], reasons: [] },
    };
  }

  if (asset.authoring === undefined) {
    return {
      readiness: {
        pluginId: asset.pluginId,
        status: "manual-only",
        discoverable: false,
        addRestore: "unavailable",
        reasons: [],
      },
      diagnostics: { errors: [], warnings: [], reasons: [] },
    };
  }

  const diagnostics: ReadinessDiagnostics = {
    errors: [],
    warnings: [],
    reasons: [],
  };
  const placement = asset.authoring.defaultPlacement;
  if (placement === undefined) {
    addWarning(
      diagnostics,
      CREATOR_ADD_RESTORE_UNAVAILABLE,
      `Plugin "${asset.pluginId}" declares authoring intents, but no deterministic defaultPlacement is provided. Creator may discover the Plugin but cannot productize Add/Restore.`,
      asset.pluginId,
    );
  } else if (placement.type === "relative") {
    validateRelativePlacement(asset, placement, assetsById, diagnostics);
  } else {
    validatePluginSlotPlacement(asset, placement, assetsById, diagnostics);
  }

  const hasDiagnostics =
    diagnostics.errors.length > 0 || diagnostics.warnings.length > 0;
  return {
    readiness: {
      pluginId: asset.pluginId,
      status: hasDiagnostics ? "limited" : "ready",
      discoverable: true,
      addRestore: hasDiagnostics ? "unavailable" : "ready",
      reasons: diagnostics.reasons,
    },
    diagnostics,
  };
}

export function analyzePluginAuthoringReadiness(
  assets: readonly PluginAsset[],
): PluginAuthoringReadiness {
  const assetsById = new Map<string, PluginAsset[]>();
  for (const asset of assets) {
    const matches = assetsById.get(asset.pluginId) ?? [];
    matches.push(asset);
    assetsById.set(asset.pluginId, matches);
  }

  const plugins: PluginCreatorReadiness[] = [];
  const errors: ProjectIssue[] = [];
  const warnings: ProjectIssue[] = [];
  for (const asset of [...assets].sort((left, right) =>
    left.pluginId.localeCompare(right.pluginId),
  )) {
    const result = analyzeAsset(asset, assetsById);
    plugins.push(result.readiness);
    errors.push(...result.diagnostics.errors);
    warnings.push(...result.diagnostics.warnings);
  }

  return { plugins, errors, warnings };
}
