import { type CreatorLocaleMessages } from "./i18n/locale.js";
export type CreatorStageName = "creator.grounding" | "creator.resolve" | "creator.productized-operation";
export type CreatorStageStatus = "running" | "completed" | "failed";
export type CreatorIntentRoute = "answer_only" | "productized" | "general-agent" | "read_only_general" | "unscoped_general" | "scoped_general_handoff" | "application_config" | "plugin_source" | "clarification" | "unsupported";
export interface CreatorStageMetadata {
    phase?: string;
    status?: string;
    postconditionStatus?: "passed" | "failed" | "unavailable";
    postconditionKind?: "instance_present" | "instance_absent" | "placement";
    postconditionEvidence?: string;
    displayIntent?: string;
    intent?: string;
    decision?: "answer_only" | "select_action" | "select_intent" | "needs_clarification" | "read_only_analysis" | "general_change" | "unsupported_product_action";
    actionId?: string;
    actionKind?: string;
    actionStatus?: string;
    effectType?: "add_default" | "remove" | "workspace_region" | "plugin_slot" | "relative" | "row_edge";
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
    verificationMode?: string;
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
    actionSelectorRepairReasonCode?: string;
    actionSelectorRepairReason?: string;
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
export declare function isCreatorStageName(value: unknown): value is CreatorStageName;
/** Read only the bounded `metadata.creator` projection from an AG-UI event. */
export declare function parseCreatorStepMetadata(value: unknown): CreatorStageMetadata | undefined;
/** Describe operation completion separately from its static and Runtime checks. */
export declare function creatorStageTitle(activity: CreatorStageActivity, localeMessages?: CreatorLocaleMessages): string;
/** Project one official Step callback into the Creator-only stage model. */
export declare function projectCreatorIntentStage(current: CreatorStageActivity | undefined, event: CreatorStepProjectionEvent): CreatorStageActivity | undefined;
export declare function interruptCreatorStage(stage: CreatorStageActivity, message?: string, localeMessages?: CreatorLocaleMessages): CreatorStageActivity;
/** Overlay final RUN_FINISHED metrics without creating a second stage fact. */
export declare function reconcileCreatorStageFromRunResult(stage: CreatorStageActivity, value: unknown): CreatorStageActivity;
/** Reconcile every persisted Creator stage against the final run result. */
export declare function reconcileCreatorStagesFromRunResult(stages: CreatorStageActivity[], value: unknown): CreatorStageActivity[];
//# sourceMappingURL=creatorStageProjection.d.ts.map