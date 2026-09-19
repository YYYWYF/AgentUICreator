export type CreatorStageName =
  | "creator.grounding"
  | "creator.resolve"
  | "creator.productized-operation";

export type CreatorStageStatus = "running" | "completed" | "failed";

export type CreatorIntentRoute =
  | "productized"
  | "general-agent"
  | "clarification"
  | "unsupported";

export interface CreatorStageMetadata {
  phase?: string;
  status?: string;
  displayIntent?: string;
  intent?: string;
  decision?:
    | "select_action"
    | "needs_clarification"
    | "general_change"
    | "unsupported_product_action";
  actionId?: string;
  actionKind?: string;
  actionStatus?: string;
  effectType?:
    | "add_default"
    | "remove"
    | "workspace_region"
    | "plugin_slot"
    | "relative"
    | "row_edge";
  region?: "left" | "center" | "right";
  targetPluginIds?: string[];
  targetInstanceIds?: string[];
  route?: CreatorIntentRoute;
  placementType?: "relative" | "plugin_slot";
  anchorPluginId?: string;
  anchorInstanceId?: string;
  relation?: "before" | "after";
  parentPluginId?: string;
  parentInstanceId?: string;
  slot?: string;
  modelCalls?: number;
  repairCalls?: number;
  invalidResponses?: number;
  durationMs?: number;
  snapshotBuildMs?: number;
  snapshotBuilds?: number;
  snapshotFailures?: number;
  operation?: string;
  executionModelCalls?: number;
  toolCalls?: number;
  deepAgentCalls?: number;
  mutationAttempts?: number;
  snapshotRefreshes?: number;
  staticStatus?: string;
  runtimeStatus?: string;
  runtimeFreshnessAttempts?: number;
  runtimeFreshnessWaitMs?: number;
  placementVerified?: boolean | null;
  geometryVerified?: boolean | null;
  generalAgentModelCalls?: number;
  generalAgentToolCalls?: number;
  actionSelectorCalls?: number;
  actionSelectorRepairCalls?: number;
  actionSelectorInvalidResponses?: number;
  actionSelectorDurationMs?: number;
  candidateCount?: number;
  contextCharacters?: number;
  totalModelCalls?: number;
  errorCode?: string;
  selectorFailureReasonCode?: string;
  selectorFailureReason?: string;
}

export interface CreatorStageActivity {
  kind: "stage";
  id: string;
  name: CreatorStageName;
  status: CreatorStageStatus;
  displayIntent?: string;
  metadata?: CreatorStageMetadata;
  error?: string;
}

export interface CreatorStepProjectionEvent {
  kind: "started" | "finished";
  name: string;
  id?: string;
  metadata?: unknown;
}

export function isCreatorStageName(value: unknown): value is CreatorStageName {
  return value === "creator.grounding" ||
    value === "creator.resolve" ||
    value === "creator.productized-operation";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function nonNegativeNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : undefined;
}

function stringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const values = value.filter((item): item is string => typeof item === "string");
  return values.length === value.length ? values : undefined;
}

function routeValue(value: unknown): CreatorIntentRoute | undefined {
  return value === "productized" ||
    value === "general-agent" ||
    value === "clarification" ||
    value === "unsupported"
    ? value
    : undefined;
}

function decisionValue(
  value: unknown,
): CreatorStageMetadata["decision"] {
  return value === "select_action" ||
    value === "needs_clarification" ||
    value === "general_change" ||
    value === "unsupported_product_action"
    ? value
    : undefined;
}

function effectTypeValue(
  value: unknown,
): CreatorStageMetadata["effectType"] {
  return value === "add_default" ||
    value === "remove" ||
    value === "workspace_region" ||
    value === "plugin_slot" ||
    value === "relative" ||
    value === "row_edge"
    ? value
    : undefined;
}

function regionValue(value: unknown): CreatorStageMetadata["region"] {
  return value === "left" || value === "center" || value === "right"
    ? value
    : undefined;
}

function placementTypeValue(value: unknown): "relative" | "plugin_slot" | undefined {
  return value === "relative" || value === "plugin_slot" ? value : undefined;
}

function relationValue(value: unknown): "before" | "after" | undefined {
  return value === "before" || value === "after" ? value : undefined;
}

/** Read only the bounded `metadata.creator` projection from an AG-UI event. */
export function parseCreatorStepMetadata(
  value: unknown,
): CreatorStageMetadata | undefined {
  if (!isRecord(value) || !isRecord(value.creator)) {
    return undefined;
  }
  const creator = value.creator;
  const metadata: CreatorStageMetadata = {};
  const stringFields = [
    "phase",
    "status",
    "displayIntent",
    "intent",
    "actionId",
    "actionKind",
    "actionStatus",
    "operation",
    "staticStatus",
    "runtimeStatus",
    "errorCode",
    "selectorFailureReasonCode",
    "selectorFailureReason",
  ] as const;
  for (const field of stringFields) {
    if (typeof creator[field] === "string") {
      metadata[field] = creator[field] as string;
    }
  }

  const decision = decisionValue(creator.decision);
  if (decision !== undefined) metadata.decision = decision;
  const effectType = effectTypeValue(creator.effectType);
  if (effectType !== undefined) metadata.effectType = effectType;
  const region = regionValue(creator.region);
  if (region !== undefined) metadata.region = region;

  const pluginIds = stringArray(creator.targetPluginIds);
  const instanceIds = stringArray(creator.targetInstanceIds);
  if (pluginIds !== undefined) metadata.targetPluginIds = pluginIds;
  if (instanceIds !== undefined) metadata.targetInstanceIds = instanceIds;
  const route = routeValue(creator.route);
  if (route !== undefined) metadata.route = route;
  const placementType = placementTypeValue(creator.placementType);
  if (placementType !== undefined) metadata.placementType = placementType;
  for (const field of [
    "anchorPluginId",
    "anchorInstanceId",
    "parentPluginId",
    "parentInstanceId",
    "slot",
  ] as const) {
    if (typeof creator[field] === "string") {
      metadata[field] = creator[field] as string;
    }
  }
  const relation = relationValue(creator.relation);
  if (relation !== undefined) metadata.relation = relation;

  const numberFields = [
    "modelCalls",
    "repairCalls",
    "invalidResponses",
    "durationMs",
    "snapshotBuildMs",
    "snapshotBuilds",
    "snapshotFailures",
    "executionModelCalls",
    "toolCalls",
    "deepAgentCalls",
    "mutationAttempts",
    "snapshotRefreshes",
    "runtimeFreshnessAttempts",
    "runtimeFreshnessWaitMs",
    "generalAgentModelCalls",
    "generalAgentToolCalls",
    "actionSelectorCalls",
    "actionSelectorRepairCalls",
    "actionSelectorInvalidResponses",
    "actionSelectorDurationMs",
    "candidateCount",
    "contextCharacters",
    "totalModelCalls",
  ] as const;
  for (const field of numberFields) {
    const number = nonNegativeNumber(creator[field]);
    if (number !== undefined) metadata[field] = number;
  }
  if (typeof creator.placementVerified === "boolean" || creator.placementVerified === null) {
    metadata.placementVerified = creator.placementVerified;
  }
  if (typeof creator.geometryVerified === "boolean" || creator.geometryVerified === null) {
    metadata.geometryVerified = creator.geometryVerified;
  }
  return metadata;
}

function mergeMetadata(
  current: CreatorStageMetadata | undefined,
  next: CreatorStageMetadata | undefined,
): CreatorStageMetadata | undefined {
  if (current === undefined && next === undefined) return undefined;
  return { ...current, ...next };
}

function statusFromMetadata(
  metadata: CreatorStageMetadata | undefined,
  fallback: CreatorStageStatus,
): CreatorStageStatus {
  if (metadata?.status === "failed" || metadata?.status === "error") {
    return "failed";
  }
  if (
    metadata?.status === "success" ||
    metadata?.status === "completed" ||
    metadata?.status === "passed" ||
    metadata?.status === "already_satisfied" ||
    metadata?.status === "committed_unverified"
  ) {
    return "completed";
  }
  return fallback;
}

/** Project one official Step callback into the Creator-only stage model. */
export function projectCreatorIntentStage(
  current: CreatorStageActivity | undefined,
  event: CreatorStepProjectionEvent,
): CreatorStageActivity | undefined {
  if (!isCreatorStageName(event.name)) {
    return current;
  }
  const metadata = parseCreatorStepMetadata(event.metadata);
  const mergedMetadata = mergeMetadata(current?.metadata, metadata);
  const displayIntent = metadata?.displayIntent ?? current?.displayIntent;
  const projected: CreatorStageActivity = {
    kind: "stage",
    id: event.id ?? current?.id ?? `creator-stage-${event.name}`,
    name: event.name,
    status:
      event.kind === "started"
        ? "running"
        : statusFromMetadata(metadata, "completed"),
    ...(displayIntent === undefined ? {} : { displayIntent }),
    ...(mergedMetadata === undefined ? {} : { metadata: mergedMetadata }),
  };
  if (event.kind === "finished" && current?.error !== undefined && projected.status === "completed") {
    const { error: _ignored, ...clearedError } = projected;
    return clearedError as CreatorStageActivity;
  }
  return projected;
}

export function interruptCreatorStage(
  stage: CreatorStageActivity,
  message = "页面刷新时该阶段尚未结束。",
): CreatorStageActivity {
  return stage.status === "running"
    ? { ...stage, status: "failed", error: message }
    : stage;
}

function finalRecord(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined;
}

function finalIntentMetadata(result: Record<string, unknown>): CreatorStageMetadata | undefined {
  const intent = finalRecord(result.creatorIntent);
  if (intent === undefined) return undefined;
  return parseCreatorStepMetadata({ creator: intent });
}

function finalActionSelectorMetadata(
  result: Record<string, unknown>,
): CreatorStageMetadata | undefined {
  const selector = finalRecord(result.actionSelector);
  const selection = finalRecord(result.actionSelection);
  const selectedAction = finalRecord(result.selectedCreatorAction);
  if (selector === undefined && selection === undefined && selectedAction === undefined) {
    return undefined;
  }

  const metadata: CreatorStageMetadata = {};
  if (selector !== undefined) {
    type ActionSelectorNumberField =
      | "actionSelectorCalls"
      | "actionSelectorRepairCalls"
      | "actionSelectorInvalidResponses"
      | "actionSelectorDurationMs"
      | "candidateCount"
      | "contextCharacters";
    const selectorFields: Array<[ActionSelectorNumberField, string]> = [
      ["actionSelectorCalls", "actionSelectorCalls"],
      ["actionSelectorRepairCalls", "actionSelectorRepairCalls"],
      ["actionSelectorInvalidResponses", "actionSelectorInvalidResponses"],
      ["actionSelectorDurationMs", "actionSelectorDurationMs"],
      ["candidateCount", "actionSelectorCandidateCount"],
      ["contextCharacters", "actionSelectorContextCharacters"],
    ];
    for (const [field, source] of selectorFields) {
      const number = nonNegativeNumber(selector[source]);
      if (number !== undefined) metadata[field] = number;
    }
    for (const field of [
      "selectorFailureReasonCode",
      "selectorFailureReason",
    ] as const) {
      if (typeof selector[field] === "string") {
        metadata[field] = selector[field];
      }
    }
    if (metadata.actionSelectorCalls !== undefined) {
      metadata.modelCalls = metadata.actionSelectorCalls;
    }
    if (metadata.actionSelectorRepairCalls !== undefined) {
      metadata.repairCalls = metadata.actionSelectorRepairCalls;
    }
    if (metadata.actionSelectorInvalidResponses !== undefined) {
      metadata.invalidResponses = metadata.actionSelectorInvalidResponses;
    }
    if (metadata.actionSelectorDurationMs !== undefined) {
      metadata.durationMs = metadata.actionSelectorDurationMs;
    }
  }

  if (selection !== undefined) {
    const decision = decisionValue(selection.decision);
    if (decision !== undefined) metadata.decision = decision;
    if (typeof selection.actionId === "string") metadata.actionId = selection.actionId;
    const route =
      decision === "select_action"
        ? "productized"
        : decision === "general_change"
          ? "general-agent"
          : decision === "needs_clarification"
            ? "clarification"
            : decision === "unsupported_product_action"
              ? "unsupported"
              : undefined;
    if (route !== undefined) metadata.route = route;
  }

  if (selectedAction !== undefined) {
    if (typeof selectedAction.actionId === "string") metadata.actionId = selectedAction.actionId;
    if (typeof selectedAction.kind === "string") {
      metadata.actionKind = selectedAction.kind;
      metadata.intent = selectedAction.kind;
    }
    if (typeof selectedAction.status === "string") metadata.actionStatus = selectedAction.status;
    const target = finalRecord(selectedAction.target);
    if (target !== undefined) {
      if (typeof target.pluginId === "string") metadata.targetPluginIds = [target.pluginId];
      if (typeof target.instanceId === "string") metadata.targetInstanceIds = [target.instanceId];
    }
    const effect = finalRecord(selectedAction.effect);
    if (effect !== undefined) {
      const effectType = effectTypeValue(effect.type);
      if (effectType !== undefined) metadata.effectType = effectType;
      const region = regionValue(effect.region);
      if (region !== undefined) metadata.region = region;
      if (effectType === "relative") {
        metadata.placementType = "relative";
        if (typeof effect.anchorPluginId === "string") metadata.anchorPluginId = effect.anchorPluginId;
        if (typeof effect.anchorInstanceId === "string") metadata.anchorInstanceId = effect.anchorInstanceId;
        const relation = relationValue(effect.relation);
        if (relation !== undefined) metadata.relation = relation;
      } else if (effectType === "plugin_slot") {
        metadata.placementType = "plugin_slot";
        if (typeof effect.parentPluginId === "string") metadata.parentPluginId = effect.parentPluginId;
        if (typeof effect.parentInstanceId === "string") metadata.parentInstanceId = effect.parentInstanceId;
        if (typeof effect.slot === "string") metadata.slot = effect.slot;
      }
    }
  }

  if (metadata.route === "general-agent") {
    const protocol = finalRecord(result.toolProtocol);
    const generalCalls = protocol?.modelCalls;
    const generalTools = protocol?.toolCalls;
    if (typeof generalCalls === "number") metadata.generalAgentModelCalls = generalCalls;
    if (typeof generalTools === "number") metadata.generalAgentToolCalls = generalTools;
    if (typeof protocol?.totalModelCalls === "number") {
      metadata.totalModelCalls = protocol.totalModelCalls;
    } else if (
      metadata.actionSelectorCalls !== undefined &&
      typeof generalCalls === "number"
    ) {
      metadata.totalModelCalls = metadata.actionSelectorCalls + generalCalls;
    }
  }

  return metadata;
}

function finalResolverMetadata(result: Record<string, unknown>): CreatorStageMetadata {
  const resolver = finalRecord(result.operationResolver);
  const protocol = finalRecord(result.toolProtocol);
  const metadata: CreatorStageMetadata = {};
  const resolverCalls = resolver?.operationResolverCalls;
  const repairCalls = resolver?.operationResolverRepairCalls;
  const invalidResponses = resolver?.operationResolverInvalidResponses;
  const durationMs = resolver?.operationResolverDurationMs;
  if (typeof resolverCalls === "number") metadata.modelCalls = resolverCalls;
  if (typeof repairCalls === "number") metadata.repairCalls = repairCalls;
  if (typeof invalidResponses === "number") metadata.invalidResponses = invalidResponses;
  if (typeof durationMs === "number") metadata.durationMs = durationMs;
  const route = routeValue(finalIntentMetadata(result)?.route);
  if (route !== undefined) metadata.route = route;
  if (route === "general-agent") {
    const generalCalls = protocol?.modelCalls;
    const generalTools = protocol?.toolCalls;
    if (typeof generalCalls === "number") metadata.generalAgentModelCalls = generalCalls;
    if (typeof generalTools === "number") metadata.generalAgentToolCalls = generalTools;
    if (metadata.modelCalls !== undefined && typeof generalCalls === "number") {
      metadata.totalModelCalls = metadata.modelCalls + generalCalls;
    }
  }
  return metadata;
}

function finalProductizedMetadata(
  result: Record<string, unknown>,
): CreatorStageMetadata | undefined {
  const operation = finalRecord(result.productizedOperation);
  if (operation === undefined) return undefined;
  const metrics = finalRecord(operation.metrics);
  const verification = finalRecord(operation.verification);
  const intent = finalIntentMetadata(result);
  const actionSelector = finalActionSelectorMetadata(result);
  const metadata: CreatorStageMetadata = {
    route: "productized",
    ...(typeof operation.operation === "string" ? { operation: operation.operation } : {}),
    ...(typeof operation.status === "string" ? { status: operation.status } : {}),
  };
  if (intent !== undefined) Object.assign(metadata, intent);
  if (actionSelector !== undefined) Object.assign(metadata, actionSelector);
  metadata.route = "productized";
  if (metrics !== undefined) {
    const fields = [
      "executionModelCalls",
      "mutationAttempts",
      "snapshotRefreshes",
    ] as const;
    for (const field of fields) {
      if (typeof metrics[field] === "number") metadata[field] = metrics[field];
    }
  }
  if (verification !== undefined) {
    const fields = [
      "staticStatus",
      "runtimeStatus",
      "runtimeFreshnessAttempts",
      "runtimeFreshnessWaitMs",
      "placementVerified",
      "geometryVerified",
    ] as const;
    for (const field of fields) {
      const value = verification[field];
      if (
        ((field === "geometryVerified" || field === "placementVerified") &&
          (typeof value === "boolean" || value === null)) ||
        (field !== "geometryVerified" && field !== "placementVerified" &&
          (typeof value === "string" || typeof value === "number"))
      ) {
        metadata[field] = value as never;
      }
    }
  }
  return metadata;
}

/** Overlay final RUN_FINISHED metrics without creating a second stage fact. */
export function reconcileCreatorStageFromRunResult(
  stage: CreatorStageActivity,
  value: unknown,
): CreatorStageActivity {
  const result = finalRecord(value);
  if (result === undefined) return stage;
  const intent = finalIntentMetadata(result);
  const actionSelector = finalActionSelectorMetadata(result);
  const nextMetadata =
    stage.name === "creator.resolve"
      ? mergeMetadata(
        mergeMetadata(
          mergeMetadata(stage.metadata, intent),
          actionSelector,
        ),
        actionSelector === undefined ? finalResolverMetadata(result) : undefined,
      )
      : mergeMetadata(stage.metadata, finalProductizedMetadata(result));
  const displayIntent = intent?.displayIntent ?? stage.displayIntent;
  return {
    ...stage,
    ...(displayIntent === undefined ? {} : { displayIntent }),
    ...(nextMetadata === undefined ? {} : { metadata: nextMetadata }),
  };
}

/** Reconcile every persisted Creator stage against the final run result. */
export function reconcileCreatorStagesFromRunResult(
  stages: CreatorStageActivity[],
  value: unknown,
): CreatorStageActivity[] {
  const result = finalRecord(value);
  if (result === undefined) return stages;
  const intent = finalIntentMetadata(result);
  const actionSelector = finalActionSelectorMetadata(result);
  const latestByName = new Map<CreatorStageName, number>();
  stages.forEach((stage, index) => latestByName.set(stage.name, index));
  const next = stages.map((stage, index) =>
    latestByName.get(stage.name) === index
      ? reconcileCreatorStageFromRunResult(stage, result)
      : stage,
  );
  if ((intent !== undefined || actionSelector !== undefined) && !latestByName.has("creator.resolve")) {
    const metadata = mergeMetadata(
      mergeMetadata(intent, actionSelector),
      actionSelector === undefined ? finalResolverMetadata(result) : undefined,
    );
    next.push({
      kind: "stage",
      id: "creator-stage-resolve-final",
      name: "creator.resolve",
      status: "completed",
      ...(intent?.displayIntent === undefined ? {} : { displayIntent: intent.displayIntent }),
      ...(metadata === undefined ? {} : { metadata }),
    });
  }
  const productized = finalProductizedMetadata(result);
  if (
    productized !== undefined &&
    !latestByName.has("creator.productized-operation")
  ) {
    next.push({
      kind: "stage",
      id: "creator-stage-productized-final",
      name: "creator.productized-operation",
      status: statusFromMetadata(productized, "completed"),
      metadata: productized,
    });
  }
  return next;
}
