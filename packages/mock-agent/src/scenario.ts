import type { ActivitySnapshotEvent, StateDeltaEvent } from "@ag-ui/core";

export type MockScenarioCategory =
  | "basics"
  | "tools"
  | "human-in-loop"
  | "state"
  | "multi-agent"
  | "presentation"
  | "advanced";

export type MockScenarioCapability =
  | "reasoning"
  | "tool"
  | "parallel-tool"
  | "run-error"
  | "approval"
  | "plan"
  | "agent-status"
  | "subagent"
  | "sources"
  | "state-sync"
  | "a2ui";

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
    outcome:
      | { type: "completed"; result?: unknown }
      | { type: "error"; message: string; code?: string | undefined };
  };
  result: unknown;
}

export interface MockScenarioResourceRequirement {
  id: string;
  label: string;
  sourceItemId: string;
}

export interface MockScenario {
  resources?: readonly MockScenarioResourceRequirement[] | undefined;
  id: string;
  title: string;
  description?: string | undefined;
  category?: MockScenarioCategory | undefined;
  capabilities?: readonly MockScenarioCapability[] | undefined;
  reference?: MockScenarioReference | undefined;
  initialState?: Record<string, unknown> | undefined;
  steps: MockScenarioStep[];
  resumeSteps?: MockScenarioResumeSteps | undefined;
  a2uiActions?: { branches: Record<string, MockScenarioStep[]>; fallback?: MockScenarioStep[] } | undefined;
  frontendContinuation?: { toolName: string; successText: string; errorText: string } | undefined;
}

/** Resume branches keep an explicit denial distinct from steer-away cancellation. */
export type MockScenarioResumeSteps =
  | MockScenarioStep[]
  | {
      approved: MockScenarioStep[];
      denied: MockScenarioStep[];
      cancelled: MockScenarioStep[];
    };

export type MockScenarioStep =
  | ({ type: "activity-snapshot"; delayMs?: number | undefined }
      & Pick<ActivitySnapshotEvent, "activityType" | "content">
      & Partial<Pick<ActivitySnapshotEvent, "replace" | "subagentRunId">>
      & { messageId?: ActivitySnapshotEvent["messageId"] | undefined })
  | {
      type: "reasoning";
      text: string;
      durationMs?: number | undefined;
    }
  | {
      type: "tool";
      /** Browser owns the result; backend emits only TOOL_CALL frames. */
      frontend?: boolean | undefined;
      name: string;
      args: Record<string, unknown>;
      result: unknown;
      toolCallId?: string | undefined;
      prepareDurationMs?: number | undefined;
      durationMs?: number | undefined;
      during?: MockScenarioStep[] | undefined;
      error?: MockToolError | undefined;
    }
  | {
      type: "tool-result";
      toolCallId: string;
      result: unknown;
      durationMs?: number | undefined;
      error?: MockToolError | undefined;
    }
  | {
      type: "parallel-tools";
      tools: MockParallelTool[];
    }
  | {
      type: "step";
      name: string;
      durationMs?: number | undefined;
    }
  | {
      type: "state-delta";
      delta: MockStateDelta;
      delayMs?: number | undefined;
    }
  | {
      type: "subagent";
      id: string;
      name: string;
      description?: string | undefined;
      durationMs?: number | undefined;
      outcome:
        | { type: "completed"; result?: unknown }
        | { type: "error"; message: string; code?: string | undefined };
      steps?: MockScenarioStep[] | undefined;
    }
  | MockSubagentToolStep
  | {
      type: "interrupt";
      toolCallId: string;
      toolName: string;
      args: Record<string, unknown>;
      interrupt: MockInterrupt;
    }
  | {
      type: "message";
      text: string;
      intervalMs?: number | undefined;
    }
  | {
      type: "custom";
      name: string;
      value: unknown;
      delayMs?: number | undefined;
      subagentRunId?: string | undefined;
    };

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateToolArgs(
  scenarioId: string,
  args: unknown,
  location: string,
): void {
  if (!isJsonObject(args)) {
    throw new Error(
      `Scenario "${scenarioId}" ${location} args must be a JSON object.`,
    );
  }

  try {
    JSON.stringify(args);
  } catch {
    throw new Error(
      `Scenario "${scenarioId}" ${location} args must be JSON-serializable.`,
    );
  }
}

interface ScenarioValidationContext {
  subagentRunId?: string | undefined;
}

function validateSteps(
  scenarioId: string,
  steps: readonly MockScenarioStep[],
  context: ScenarioValidationContext,
): void {
  for (const step of steps) {
    if (step.type === "interrupt" && context.subagentRunId !== undefined) {
      throw new Error(
        `Scenario "${scenarioId}" contains an interrupt inside a subagent.\n` +
        "Nested subagent interrupts are not supported by the current " +
        "AG-UI 0.0.59 + assistant-ui reference profile.",
      );
    }

    if (
      context.subagentRunId !== undefined &&
      ((step.type === "tool" && step.error !== undefined) ||
        (step.type === "tool-result" && step.error !== undefined))
    ) {
      throw new Error(
        `Scenario "${scenarioId}" contains a Tool error inside subagent ` +
        `"${context.subagentRunId}". Subagent tool failures must use ` +
        "outcome: { type: \"error\" } so the runner emits SUBAGENT_ERROR.",
      );
    }

    if (step.type === "activity-snapshot") {
      validateToolArgs(scenarioId, step.content, "activity snapshot");
      if (!step.activityType.trim()) throw new Error(`Scenario "${scenarioId}" requires an activityType.`);
      continue;
    }

    if (step.type === "tool") {
      if (step.frontend && context.subagentRunId !== undefined) {
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
export function validateMockScenario(scenario: MockScenario): void {
  validateSteps(scenario.id, scenario.steps, {});

  for (const branch of Object.values(scenario.a2uiActions?.branches ?? {})) validateSteps(scenario.id, branch, {});
  if (scenario.a2uiActions?.fallback) validateSteps(scenario.id, scenario.a2uiActions.fallback, {});

  if (scenario.resumeSteps === undefined) return;
  if (Array.isArray(scenario.resumeSteps)) {
    validateSteps(scenario.id, scenario.resumeSteps, {});
    return;
  }
  validateSteps(scenario.id, scenario.resumeSteps.approved, {});
  validateSteps(scenario.id, scenario.resumeSteps.denied, {});
  validateSteps(scenario.id, scenario.resumeSteps.cancelled, {});
}

export function defineScenario(scenario: MockScenario): MockScenario {
  return scenario;
}
