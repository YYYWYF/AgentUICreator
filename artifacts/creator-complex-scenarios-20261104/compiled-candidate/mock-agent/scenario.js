function isJsonObject(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function validateToolArgs(scenarioId, args, location) {
    if (!isJsonObject(args)) {
        throw new Error(`Scenario "${scenarioId}" ${location} args must be a JSON object.`);
    }
    try {
        JSON.stringify(args);
    }
    catch {
        throw new Error(`Scenario "${scenarioId}" ${location} args must be JSON-serializable.`);
    }
}
function validateJsonValue(scenarioId, value, location) {
    try {
        JSON.stringify(value);
    }
    catch {
        throw new Error(`Scenario "${scenarioId}" ${location} must be JSON-serializable.`);
    }
}
function validateSteps(scenarioId, steps, context) {
    for (const step of steps) {
        if (step.type === "interrupt" && context.subagentRunId !== undefined) {
            throw new Error(`Scenario "${scenarioId}" contains an interrupt inside a subagent.\n` +
                "Nested subagent interrupts are not supported by the current " +
                "AG-UI 1.0 + Agent UI reference profile.");
        }
        if (context.subagentRunId !== undefined &&
            ((step.type === "tool" && step.error !== undefined) ||
                (step.type === "tool-result" && step.error !== undefined))) {
            throw new Error(`Scenario "${scenarioId}" contains a Tool error inside subagent ` +
                `"${context.subagentRunId}". Subagent tool failures must use ` +
                "outcome: { type: \"error\" } so the runner emits SUBAGENT_ERROR.");
        }
        if (step.type === "activity-snapshot") {
            validateToolArgs(scenarioId, step.content, "activity snapshot");
            if (!step.activityType.trim())
                throw new Error(`Scenario "${scenarioId}" requires an activityType.`);
            if (step.messageId !== undefined && !step.messageId.trim())
                throw new Error(`Scenario "${scenarioId}" requires a non-empty activity messageId.`);
            continue;
        }
        if (step.type === "activity-delta") {
            if (!step.activityType.trim())
                throw new Error(`Scenario "${scenarioId}" requires an activityType.`);
            if (!step.messageId.trim())
                throw new Error(`Scenario "${scenarioId}" requires an activity messageId.`);
            if (!Array.isArray(step.patch))
                throw new Error(`Scenario "${scenarioId}" requires an activity patch array.`);
            validateJsonValue(scenarioId, step.patch, "activity patch");
            continue;
        }
        if (step.type === "tool") {
            if ((step.frontend || step.human) && context.subagentRunId !== undefined) {
                throw new Error(`Scenario "${scenarioId}" cannot invoke a root-only Frontend Tool from a subagent.`);
            }
            validateToolArgs(scenarioId, step.args, `tool "${step.name}"`);
            if (step.during !== undefined) {
                validateSteps(scenarioId, step.during, context);
            }
            continue;
        }
        if (step.type === "parallel-tools") {
            for (const tool of step.tools) {
                validateToolArgs(scenarioId, tool.args, `parallel tool "${tool.name}"`);
            }
            continue;
        }
        if (step.type === "subagent") {
            if (step.steps !== undefined) {
                validateSteps(scenarioId, step.steps, {
                    subagentRunId: step.id,
                });
            }
            continue;
        }
        if (step.type === "subagent-tool") {
            validateToolArgs(scenarioId, step.args, `subagent tool "${step.toolName}"`);
            validateSteps(scenarioId, step.subagent.steps, {
                subagentRunId: step.subagent.id,
            });
            continue;
        }
        if (step.type === "interrupt") {
            validateToolArgs(scenarioId, step.args, `interrupt tool "${step.toolName}"`);
        }
    }
}
/** Validates the readiness constraints of a mock scenario before serving it. */
export function validateMockScenario(scenario) {
    for (const resourceId of scenario.resources ?? []) {
        if (typeof resourceId !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(resourceId))
            throw new Error(`Invalid official resource ID in scenario ${scenario.id}.`);
    }
    validateSteps(scenario.id, scenario.steps, {});
    for (const branch of Object.values(scenario.a2uiActions?.branches ?? {}))
        validateSteps(scenario.id, branch, {});
    if (scenario.a2uiActions?.fallback)
        validateSteps(scenario.id, scenario.a2uiActions.fallback, {});
    if (scenario.resumeSteps === undefined)
        return;
    if (Array.isArray(scenario.resumeSteps)) {
        validateSteps(scenario.id, scenario.resumeSteps, {});
        return;
    }
    validateSteps(scenario.id, scenario.resumeSteps.approved, {});
    validateSteps(scenario.id, scenario.resumeSteps.denied, {});
    validateSteps(scenario.id, scenario.resumeSteps.cancelled, {});
}
export function defineScenario(scenario) {
    return scenario;
}
//# sourceMappingURL=scenario.js.map