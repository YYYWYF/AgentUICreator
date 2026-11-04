import { useAgentUILocale, DEFAULT_CREATOR_MESSAGES } from "./i18n/locale.js";
export function isCreatorStageName(value) {
    return value === "creator.grounding" ||
        value === "creator.resolve" ||
        value === "creator.productized-operation";
}
function isRecord(value) {
    return typeof value === "object" && value !== null;
}
function nonNegativeNumber(value) {
    return typeof value === "number" && Number.isFinite(value) && value >= 0
        ? value
        : undefined;
}
function stringArray(value) {
    if (!Array.isArray(value)) {
        return undefined;
    }
    const values = value.filter((item) => typeof item === "string");
    return values.length === value.length ? values : undefined;
}
function routeValue(value) {
    return value === "answer_only" ||
        value === "productized" ||
        value === "general-agent" ||
        value === "read_only_general" ||
        value === "unscoped_general" ||
        value === "scoped_general_handoff" ||
        value === "application_config" ||
        value === "plugin_source" ||
        value === "clarification" ||
        value === "unsupported"
        ? value
        : undefined;
}
function decisionValue(value) {
    return value === "select_action" ||
        value === "answer_only" ||
        value === "select_intent" ||
        value === "needs_clarification" ||
        value === "read_only_analysis" ||
        value === "general_change" ||
        value === "unsupported_product_action"
        ? value
        : undefined;
}
function effectTypeValue(value) {
    return value === "add_default" ||
        value === "remove" ||
        value === "workspace_region" ||
        value === "plugin_slot" ||
        value === "relative" ||
        value === "row_edge"
        ? value
        : undefined;
}
function postconditionStatusValue(value) {
    return value === "passed" || value === "failed" || value === "unavailable"
        ? value
        : undefined;
}
function postconditionKindValue(value) {
    return value === "instance_present" ||
        value === "instance_absent" ||
        value === "placement"
        ? value
        : undefined;
}
function regionValue(value) {
    return value === "left" || value === "center" || value === "right"
        ? value
        : undefined;
}
function placementTypeValue(value) {
    return value === "relative" || value === "plugin_slot" ? value : undefined;
}
function relationValue(value) {
    return value === "before" || value === "after" ? value : undefined;
}
/** Read only the bounded `metadata.creator` projection from an AG-UI event. */
export function parseCreatorStepMetadata(value) {
    if (!isRecord(value) || !isRecord(value.creator)) {
        return undefined;
    }
    const creator = value.creator;
    const metadata = {};
    const stringFields = [
        "phase",
        "status",
        "displayIntent",
        "intent",
        "postconditionEvidence",
        "actionId",
        "actionKind",
        "actionStatus",
        "operation",
        "staticStatus",
        "verificationMode",
        "runtimeStatus",
        "errorCode",
        "selectorFailureReasonCode",
        "selectorFailureReason",
        "actionSelectorRepairReasonCode",
        "actionSelectorRepairReason",
    ];
    for (const field of stringFields) {
        if (typeof creator[field] === "string") {
            metadata[field] = creator[field];
        }
    }
    const decision = decisionValue(creator.decision);
    if (decision !== undefined)
        metadata.decision = decision;
    const postconditionStatus = postconditionStatusValue(creator.postconditionStatus);
    if (postconditionStatus !== undefined) {
        metadata.postconditionStatus = postconditionStatus;
    }
    const postconditionKind = postconditionKindValue(creator.postconditionKind);
    if (postconditionKind !== undefined) {
        metadata.postconditionKind = postconditionKind;
    }
    const effectType = effectTypeValue(creator.effectType);
    if (effectType !== undefined)
        metadata.effectType = effectType;
    const region = regionValue(creator.region);
    if (region !== undefined)
        metadata.region = region;
    const pluginIds = stringArray(creator.targetPluginIds);
    const instanceIds = stringArray(creator.targetInstanceIds);
    if (pluginIds !== undefined)
        metadata.targetPluginIds = pluginIds;
    if (instanceIds !== undefined)
        metadata.targetInstanceIds = instanceIds;
    const route = routeValue(creator.route);
    if (route !== undefined)
        metadata.route = route;
    const placementType = placementTypeValue(creator.placementType);
    if (placementType !== undefined)
        metadata.placementType = placementType;
    for (const field of [
        "anchorPluginId",
        "anchorInstanceId",
        "parentPluginId",
        "parentInstanceId",
        "slot",
    ]) {
        if (typeof creator[field] === "string") {
            metadata[field] = creator[field];
        }
    }
    const relation = relationValue(creator.relation);
    if (relation !== undefined)
        metadata.relation = relation;
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
    ];
    for (const field of numberFields) {
        const number = nonNegativeNumber(creator[field]);
        if (number !== undefined)
            metadata[field] = number;
    }
    if (typeof creator.placementVerified === "boolean" || creator.placementVerified === null) {
        metadata.placementVerified = creator.placementVerified;
    }
    if (typeof creator.geometryVerified === "boolean" || creator.geometryVerified === null) {
        metadata.geometryVerified = creator.geometryVerified;
    }
    return metadata;
}
function mergeMetadata(current, next) {
    if (current === undefined && next === undefined)
        return undefined;
    return { ...current, ...next };
}
function statusFromMetadata(metadata, fallback) {
    if (metadata?.status === "failed" || metadata?.status === "error") {
        return "failed";
    }
    if (metadata?.status === "success" ||
        metadata?.status === "completed" ||
        metadata?.status === "passed" ||
        metadata?.status === "already_satisfied" ||
        metadata?.status === "committed_unverified") {
        return "completed";
    }
    return fallback;
}
/** Describe operation completion separately from its static and Runtime checks. */
export function creatorStageTitle(activity, localeMessages = DEFAULT_CREATOR_MESSAGES) {
    if (activity.name === "creator.grounding") {
        if (activity.status === "running")
            return localeMessages.creatorStages.readingProjectState;
        if (activity.status === "failed")
            return localeMessages.creatorStages.couldNotReadProjectState;
        return localeMessages.creatorStages.projectStateRead;
    }
    if (activity.name === "creator.resolve") {
        if (activity.status === "running")
            return localeMessages.creatorStages.understandingYourRequest;
        if (activity.status === "failed")
            return localeMessages.creatorStages.couldNotUnderstandTheRequest;
        if (activity.metadata?.route === "clarification") {
            return localeMessages.creatorStages.confirmTheChangeTarget;
        }
        if (activity.metadata?.route === "unsupported") {
            return localeMessages.creatorStages.noCorrespondingOperationCanBePerformedSafely;
        }
        return localeMessages.creatorStages.intentIdentified;
    }
    if (activity.status === "running")
        return localeMessages.creatorStages.applyingAndVerifyingChanges;
    if (activity.status === "failed" || activity.metadata?.status === "failed") {
        return localeMessages.creatorStages.changesIncomplete;
    }
    if (activity.metadata?.status === "already_satisfied") {
        return localeMessages.creatorStages.currentStateAlreadySatisfiesTheRequest;
    }
    if (activity.metadata?.status === "committed_unverified") {
        return localeMessages.creatorStages.changesCommittedRequestOutcomeUnconfirmed;
    }
    if (activity.metadata?.status === "success") {
        if (activity.metadata.staticStatus === "failed") {
            return localeMessages.creatorStages.requestedChangesCompleteStaticValidationFailed;
        }
        if (activity.metadata.runtimeStatus === "stale") {
            return localeMessages.creatorStages.requestedChangesCompleteRuntimeHasNotObservedThe;
        }
        if (activity.metadata.runtimeStatus === "unavailable") {
            return localeMessages.creatorStages.requestedChangesCompleteRuntimeTemporarilyUnavailable;
        }
        if (activity.metadata.runtimeStatus === "failed") {
            return localeMessages.creatorStages.requestedChangesCompleteRuntimeVerificationFailed;
        }
        if (activity.metadata.staticStatus === "passed" &&
            (activity.metadata.runtimeStatus === "passed" ||
                activity.metadata.runtimeStatus === "not-run")) {
            return localeMessages.creatorStages.requestedChangesComplete;
        }
        return localeMessages.creatorStages.requestedChangesCompleteSomeVerificationIncomplete;
    }
    return localeMessages.creatorStages.changeStatusUnconfirmed;
}
/** Project one official Step callback into the Creator-only stage model. */
export function projectCreatorIntentStage(current, event) {
    if (!isCreatorStageName(event.name)) {
        return current;
    }
    const metadata = parseCreatorStepMetadata(event.metadata);
    const mergedMetadata = mergeMetadata(current?.metadata, metadata);
    const displayIntent = metadata?.displayIntent ?? current?.displayIntent;
    const projected = {
        kind: "stage",
        id: event.id ?? current?.id ?? `creator-stage-${event.name}`,
        name: event.name,
        status: event.kind === "started"
            ? "running"
            : statusFromMetadata(metadata, "completed"),
        ...(displayIntent === undefined ? {} : { displayIntent }),
        ...(mergedMetadata === undefined ? {} : { metadata: mergedMetadata }),
    };
    if (event.kind === "finished" && current?.error !== undefined && projected.status === "completed") {
        const { error: _ignored, ...clearedError } = projected;
        return clearedError;
    }
    return projected;
}
export function interruptCreatorStage(stage, message = DEFAULT_CREATOR_MESSAGES.creatorStages.thisStageWasStillRunningWhenThePage, localeMessages = DEFAULT_CREATOR_MESSAGES) {
    return stage.status === "running"
        ? { ...stage, status: "failed", error: message }
        : stage;
}
function finalRecord(value) {
    return isRecord(value) ? value : undefined;
}
function finalIntentMetadata(result) {
    const intent = finalRecord(result.creatorIntent);
    if (intent === undefined)
        return undefined;
    return parseCreatorStepMetadata({ creator: intent });
}
function finalActionSelectorMetadata(result) {
    const selector = finalRecord(result.actionSelector);
    const selection = finalRecord(result.actionSelection);
    const selectedAction = finalRecord(result.selectedCreatorAction);
    if (selector === undefined && selection === undefined && selectedAction === undefined) {
        return undefined;
    }
    const metadata = {};
    if (selector !== undefined) {
        const selectorFields = [
            ["actionSelectorCalls", "actionSelectorCalls"],
            ["actionSelectorRepairCalls", "actionSelectorRepairCalls"],
            ["actionSelectorInvalidResponses", "actionSelectorInvalidResponses"],
            ["actionSelectorDurationMs", "actionSelectorDurationMs"],
            ["candidateCount", "actionSelectorCandidateCount"],
            ["contextCharacters", "actionSelectorContextCharacters"],
        ];
        for (const [field, source] of selectorFields) {
            const number = nonNegativeNumber(selector[source]);
            if (number !== undefined)
                metadata[field] = number;
        }
        for (const field of [
            "selectorFailureReasonCode",
            "selectorFailureReason",
            "actionSelectorRepairReasonCode",
            "actionSelectorRepairReason",
        ]) {
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
        if (decision !== undefined)
            metadata.decision = decision;
        if (typeof selection.actionId === "string")
            metadata.actionId = selection.actionId;
        const route = decision === "select_action"
            ? "productized"
            : decision === "general_change"
                ? "general-agent"
                : decision === "needs_clarification"
                    ? "clarification"
                    : decision === "unsupported_product_action"
                        ? "unsupported"
                        : undefined;
        if (route !== undefined)
            metadata.route = route;
    }
    if (selectedAction !== undefined) {
        if (typeof selectedAction.actionId === "string")
            metadata.actionId = selectedAction.actionId;
        if (typeof selectedAction.kind === "string") {
            metadata.actionKind = selectedAction.kind;
            metadata.intent = selectedAction.kind;
        }
        if (typeof selectedAction.status === "string")
            metadata.actionStatus = selectedAction.status;
        const target = finalRecord(selectedAction.target);
        if (target !== undefined) {
            if (typeof target.pluginId === "string")
                metadata.targetPluginIds = [target.pluginId];
            if (typeof target.instanceId === "string")
                metadata.targetInstanceIds = [target.instanceId];
        }
        const effect = finalRecord(selectedAction.effect);
        if (effect !== undefined) {
            const effectType = effectTypeValue(effect.type);
            if (effectType !== undefined)
                metadata.effectType = effectType;
            const region = regionValue(effect.region);
            if (region !== undefined)
                metadata.region = region;
            if (effectType === "relative") {
                metadata.placementType = "relative";
                if (typeof effect.anchorPluginId === "string")
                    metadata.anchorPluginId = effect.anchorPluginId;
                if (typeof effect.anchorInstanceId === "string")
                    metadata.anchorInstanceId = effect.anchorInstanceId;
                const relation = relationValue(effect.relation);
                if (relation !== undefined)
                    metadata.relation = relation;
            }
            else if (effectType === "plugin_slot") {
                metadata.placementType = "plugin_slot";
                if (typeof effect.parentPluginId === "string")
                    metadata.parentPluginId = effect.parentPluginId;
                if (typeof effect.parentInstanceId === "string")
                    metadata.parentInstanceId = effect.parentInstanceId;
                if (typeof effect.slot === "string")
                    metadata.slot = effect.slot;
            }
        }
    }
    if (metadata.route === "general-agent") {
        const protocol = finalRecord(result.toolProtocol);
        const generalCalls = protocol?.modelCalls;
        const generalTools = protocol?.toolCalls;
        if (typeof generalCalls === "number")
            metadata.generalAgentModelCalls = generalCalls;
        if (typeof generalTools === "number")
            metadata.generalAgentToolCalls = generalTools;
        if (typeof protocol?.totalModelCalls === "number") {
            metadata.totalModelCalls = protocol.totalModelCalls;
        }
        else if (metadata.actionSelectorCalls !== undefined &&
            typeof generalCalls === "number") {
            metadata.totalModelCalls = metadata.actionSelectorCalls + generalCalls;
        }
    }
    return metadata;
}
function finalResolverMetadata(result) {
    const resolver = finalRecord(result.operationResolver);
    const protocol = finalRecord(result.toolProtocol);
    const metadata = {};
    const resolverCalls = resolver?.operationResolverCalls;
    const repairCalls = resolver?.operationResolverRepairCalls;
    const invalidResponses = resolver?.operationResolverInvalidResponses;
    const durationMs = resolver?.operationResolverDurationMs;
    if (typeof resolverCalls === "number")
        metadata.modelCalls = resolverCalls;
    if (typeof repairCalls === "number")
        metadata.repairCalls = repairCalls;
    if (typeof invalidResponses === "number")
        metadata.invalidResponses = invalidResponses;
    if (typeof durationMs === "number")
        metadata.durationMs = durationMs;
    const route = routeValue(finalIntentMetadata(result)?.route);
    if (route !== undefined)
        metadata.route = route;
    if (route === "general-agent") {
        const generalCalls = protocol?.modelCalls;
        const generalTools = protocol?.toolCalls;
        if (typeof generalCalls === "number")
            metadata.generalAgentModelCalls = generalCalls;
        if (typeof generalTools === "number")
            metadata.generalAgentToolCalls = generalTools;
        if (metadata.modelCalls !== undefined && typeof generalCalls === "number") {
            metadata.totalModelCalls = metadata.modelCalls + generalCalls;
        }
    }
    return metadata;
}
function finalProductizedMetadata(result) {
    const operation = finalRecord(result.productizedOperation);
    if (operation === undefined)
        return undefined;
    const metrics = finalRecord(operation.metrics);
    const verification = finalRecord(operation.verification);
    const postcondition = finalRecord(operation.postcondition);
    const intent = finalIntentMetadata(result);
    const actionSelector = finalActionSelectorMetadata(result);
    const metadata = {
        route: "productized",
        ...(typeof operation.operation === "string" ? { operation: operation.operation } : {}),
        ...(typeof operation.status === "string" ? { status: operation.status } : {}),
    };
    if (intent !== undefined)
        Object.assign(metadata, intent);
    if (actionSelector !== undefined)
        Object.assign(metadata, actionSelector);
    metadata.route = "productized";
    if (postcondition !== undefined) {
        const status = postconditionStatusValue(postcondition.status);
        if (status !== undefined)
            metadata.postconditionStatus = status;
        const kind = postconditionKindValue(postcondition.kind);
        if (kind !== undefined)
            metadata.postconditionKind = kind;
        if (typeof postcondition.evidence === "string") {
            metadata.postconditionEvidence = postcondition.evidence;
        }
    }
    if (metrics !== undefined) {
        const fields = [
            "executionModelCalls",
            "mutationAttempts",
            "snapshotRefreshes",
        ];
        for (const field of fields) {
            if (typeof metrics[field] === "number")
                metadata[field] = metrics[field];
        }
    }
    if (verification !== undefined) {
        const fields = [
            "staticStatus",
            "verificationMode",
            "runtimeStatus",
            "runtimeFreshnessAttempts",
            "runtimeFreshnessWaitMs",
            "placementVerified",
            "geometryVerified",
        ];
        for (const field of fields) {
            const value = verification[field];
            if (((field === "geometryVerified" || field === "placementVerified") &&
                (typeof value === "boolean" || value === null)) ||
                (field !== "geometryVerified" && field !== "placementVerified" &&
                    (typeof value === "string" || typeof value === "number"))) {
                metadata[field] = value;
            }
        }
    }
    return metadata;
}
/** Overlay final RUN_FINISHED metrics without creating a second stage fact. */
export function reconcileCreatorStageFromRunResult(stage, value) {
    const result = finalRecord(value);
    if (result === undefined)
        return stage;
    const intent = finalIntentMetadata(result);
    const actionSelector = finalActionSelectorMetadata(result);
    const nextMetadata = stage.name === "creator.resolve"
        ? mergeMetadata(mergeMetadata(mergeMetadata(stage.metadata, intent), actionSelector), actionSelector === undefined ? finalResolverMetadata(result) : undefined)
        : mergeMetadata(stage.metadata, finalProductizedMetadata(result));
    const displayIntent = intent?.displayIntent ?? stage.displayIntent;
    return {
        ...stage,
        ...(displayIntent === undefined ? {} : { displayIntent }),
        ...(nextMetadata === undefined ? {} : { metadata: nextMetadata }),
    };
}
/** Reconcile every persisted Creator stage against the final run result. */
export function reconcileCreatorStagesFromRunResult(stages, value) {
    const result = finalRecord(value);
    if (result === undefined)
        return stages;
    const intent = finalIntentMetadata(result);
    const actionSelector = finalActionSelectorMetadata(result);
    const latestByName = new Map();
    stages.forEach((stage, index) => latestByName.set(stage.name, index));
    const next = stages.map((stage, index) => latestByName.get(stage.name) === index
        ? reconcileCreatorStageFromRunResult(stage, result)
        : stage);
    if ((intent !== undefined || actionSelector !== undefined) && !latestByName.has("creator.resolve")) {
        const metadata = mergeMetadata(mergeMetadata(intent, actionSelector), actionSelector === undefined ? finalResolverMetadata(result) : undefined);
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
    if (productized !== undefined &&
        !latestByName.has("creator.productized-operation")) {
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
//# sourceMappingURL=creatorStageProjection.js.map