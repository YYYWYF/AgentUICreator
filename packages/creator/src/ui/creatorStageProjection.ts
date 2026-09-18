export type CreatorStageName =
  | "creator.grounding"
  | "creator.resolve"
  | "creator.productized-operation";

export type CreatorStageStatus = "running" | "completed" | "failed";

export type CreatorIntentRoute =
  | "productized"
  | "general-agent"
  | "clarification";

export interface CreatorStageMetadata {
  phase?: string;
  status?: string;
  displayIntent?: string;
  intent?: string;
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
  totalModelCalls?: number;
  errorCode?: string;
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
    value === "clarification"
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
    "operation",
    "staticStatus",
    "runtimeStatus",
    "errorCode",
  ] as const;
  for (const field of stringFields) {
    if (typeof creator[field] === "string") {
      metadata[field] = creator[field] as string;
    }
  }

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
  const metadata: CreatorStageMetadata = {
    route: "productized",
    ...(typeof operation.operation === "string" ? { operation: operation.operation } : {}),
    ...(typeof operation.status === "string" ? { status: operation.status } : {}),
  };
  if (intent !== undefined) {
    if (intent.placementType !== undefined) metadata.placementType = intent.placementType;
    if (intent.anchorPluginId !== undefined) metadata.anchorPluginId = intent.anchorPluginId;
    if (intent.anchorInstanceId !== undefined) metadata.anchorInstanceId = intent.anchorInstanceId;
    if (intent.relation !== undefined) metadata.relation = intent.relation;
    if (intent.parentPluginId !== undefined) metadata.parentPluginId = intent.parentPluginId;
    if (intent.parentInstanceId !== undefined) metadata.parentInstanceId = intent.parentInstanceId;
    if (intent.slot !== undefined) metadata.slot = intent.slot;
  }
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
  const nextMetadata =
    stage.name === "creator.resolve"
      ? mergeMetadata(mergeMetadata(stage.metadata, intent), finalResolverMetadata(result))
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
  const latestByName = new Map<CreatorStageName, number>();
  stages.forEach((stage, index) => latestByName.set(stage.name, index));
  const next = stages.map((stage, index) =>
    latestByName.get(stage.name) === index
      ? reconcileCreatorStageFromRunResult(stage, result)
      : stage,
  );
  if (intent !== undefined && !latestByName.has("creator.resolve")) {
    const metadata = mergeMetadata(intent, finalResolverMetadata(result));
    next.push({
      kind: "stage",
      id: "creator-stage-resolve-final",
      name: "creator.resolve",
      status: "completed",
      ...(intent.displayIntent === undefined ? {} : { displayIntent: intent.displayIntent }),
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
