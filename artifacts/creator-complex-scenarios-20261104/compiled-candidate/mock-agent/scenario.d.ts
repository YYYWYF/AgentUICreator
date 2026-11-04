import type { ActivityDeltaEvent, ActivitySnapshotEvent, StateDeltaEvent, RunAgentInput } from "@ag-ui/core";
export type MockScenarioCategory = "basics" | "tools" | "human-in-loop" | "state" | "multi-agent" | "presentation" | "advanced";
export type MockScenarioCapability = "reasoning" | "tool" | "parallel-tool" | "run-error" | "approval" | "plan" | "agent-status" | "subagent" | "sources" | "state-sync" | "a2ui";
export type MockScenarioAudience = "backend" | "frontend" | "internal";
/** The JSON Patch payload from the official AG-UI STATE_DELTA event. */
export type MockStateDelta = StateDeltaEvent["delta"];
export interface MockScenarioReference {
    audience?: MockScenarioAudience | undefined;
    protocol?: string | undefined;
    pattern?: string | undefined;
    presentation?: string | undefined;
    level?: "recommended" | "advanced" | "edge" | "protocol" | undefined;
    eventFlow?: readonly string[] | undefined;
    notes?: readonly string[] | undefined;
}
export interface MockParallelTool {
    id?: string | undefined;
    name: string;
    args: Record<string, unknown>;
    result: unknown;
    startDelayMs?: number | undefined;
    prepareDurationMs?: number | undefined;
    durationMs?: number | undefined;
}
export interface MockToolError {
    type: "error";
    message: string;
    code?: string | undefined;
}
export interface MockInterrupt {
    id: string;
    reason: string;
    message?: string | undefined;
    toolCallId?: string | undefined;
    responseSchema?: Record<string, unknown> | undefined;
    metadata?: Record<string, unknown> | undefined;
}
export interface MockSubagentToolStep {
    type: "subagent-tool";
    toolCallId: string;
    toolName: string;
    args: Record<string, unknown>;
    prepareDurationMs?: number | undefined;
    subagent: {
        id: string;
        name: string;
        description?: string | undefined;
        steps: MockScenarioStep[];
        outcome: {
            type: "completed";
            result?: unknown;
        } | {
            type: "error";
            message: string;
            code?: string | undefined;
        };
    };
    result: unknown;
}
/** Stable Official Resource ID; implementation belongs to the development-time catalog. */
export type MockScenarioResourceId = string;
export interface MockScenario {
    /** Server-only preparation hook; excluded from scenario list DTOs. */
    prepareRun?(input: RunAgentInput, options: {
        signal: AbortSignal;
    }): Promise<{
        input?: RunAgentInput;
        steps?: readonly MockScenarioStep[];
    }>;
    /** Development-only server-owned run used by the refresh recovery demo. */
    durableRun?: true | undefined;
    resources?: readonly MockScenarioResourceId[] | undefined;
    id: string;
    title: string;
    description?: string | undefined;
    category?: MockScenarioCategory | undefined;
    capabilities?: readonly MockScenarioCapability[] | undefined;
    reference?: MockScenarioReference | undefined;
    initialState?: Record<string, unknown> | undefined;
    steps: MockScenarioStep[];
    resumeSteps?: MockScenarioResumeSteps | undefined;
    a2uiActions?: {
        branches: Record<string, MockScenarioStep[]>;
        fallback?: MockScenarioStep[];
    } | undefined;
    frontendContinuation?: {
        toolName: string;
        successText: string;
        errorText: string;
    } | undefined;
    humanQuestionContinuation?: {
        toolName: string;
        stepId: string;
        answerText: Record<string, string>;
        errorText: string;
    } | undefined;
}
/** Resume branches keep an explicit denial distinct from steer-away cancellation. */
export type MockScenarioResumeSteps = MockScenarioStep[] | {
    approved: MockScenarioStep[];
    denied: MockScenarioStep[];
    cancelled: MockScenarioStep[];
};
export type MockScenarioStep = ({
    type: "activity-snapshot";
    delayMs?: number | undefined;
} & Pick<ActivitySnapshotEvent, "activityType" | "content"> & Partial<Pick<ActivitySnapshotEvent, "replace" | "subagentRunId">> & {
    messageId?: ActivitySnapshotEvent["messageId"] | undefined;
}) | ({
    type: "activity-delta";
    delayMs?: number | undefined;
} & Pick<ActivityDeltaEvent, "activityType" | "messageId" | "patch"> & Partial<Pick<ActivityDeltaEvent, "subagentRunId">>) | {
    type: "reasoning";
    text: string;
    durationMs?: number | undefined;
} | {
    type: "tool";
    /** Browser owns the result; backend emits only TOOL_CALL frames. */
    frontend?: boolean | undefined;
    /** Human Tool waits for addResult instead of browser capability execution. */
    human?: boolean | undefined;
    name: string;
    args: Record<string, unknown>;
    result: unknown;
    toolCallId?: string | undefined;
    prepareDurationMs?: number | undefined;
    durationMs?: number | undefined;
    during?: MockScenarioStep[] | undefined;
    error?: MockToolError | undefined;
} | {
    type: "tool-result";
    toolCallId: string;
    result: unknown;
    durationMs?: number | undefined;
    error?: MockToolError | undefined;
} | {
    type: "parallel-tools";
    tools: MockParallelTool[];
} | {
    type: "step";
    name: string;
    durationMs?: number | undefined;
} | {
    type: "state-delta";
    delta: MockStateDelta;
    delayMs?: number | undefined;
} | {
    type: "subagent";
    id: string;
    name: string;
    description?: string | undefined;
    durationMs?: number | undefined;
    outcome: {
        type: "completed";
        result?: unknown;
    } | {
        type: "error";
        message: string;
        code?: string | undefined;
    };
    steps?: MockScenarioStep[] | undefined;
} | MockSubagentToolStep | {
    type: "interrupt";
    toolCallId: string;
    toolName: string;
    args: Record<string, unknown>;
    interrupt: MockInterrupt;
} | {
    type: "message";
    text: string;
    intervalMs?: number | undefined;
} | {
    type: "custom";
    name: string;
    value: unknown;
    delayMs?: number | undefined;
    subagentRunId?: string | undefined;
};
/** Validates the readiness constraints of a mock scenario before serving it. */
export declare function validateMockScenario(scenario: MockScenario): void;
export declare function defineScenario(scenario: MockScenario): MockScenario;
//# sourceMappingURL=scenario.d.ts.map