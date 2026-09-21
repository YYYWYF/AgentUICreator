import type { StateDeltaEvent } from "@ag-ui/core";

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
  | "state-sync";

/** The JSON Patch payload from the official AG-UI STATE_DELTA event. */
export type MockStateDelta = StateDeltaEvent["delta"];

export interface MockScenarioReference {
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
  args: unknown;
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
  args: unknown;
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

export interface MockScenario {
  id: string;
  title: string;
  description?: string | undefined;
  category?: MockScenarioCategory | undefined;
  capabilities?: readonly MockScenarioCapability[] | undefined;
  reference?: MockScenarioReference | undefined;
  initialState?: Record<string, unknown> | undefined;
  steps: MockScenarioStep[];
  resumeSteps?: MockScenarioResumeSteps | undefined;
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
  | {
      type: "reasoning";
      text: string;
      durationMs?: number | undefined;
    }
  | {
      type: "tool";
      name: string;
      args: unknown;
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
      args: unknown;
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

export function defineScenario(scenario: MockScenario): MockScenario {
  return scenario;
}
