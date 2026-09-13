export type MockScenarioCategory =
  | "conversation"
  | "reasoning"
  | "tool"
  | "approval"
  | "agent";

export type MockScenarioCapability =
  | "reasoning"
  | "tool"
  | "parallel-tool"
  | "tool-error"
  | "approval"
  | "plan"
  | "agent-status"
  | "subagent"
  | "sources";

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

export interface MockScenario {
  id: string;
  title: string;
  description?: string | undefined;
  category?: MockScenarioCategory | undefined;
  capabilities?: readonly MockScenarioCapability[] | undefined;
  initialState?: Record<string, unknown> | undefined;
  steps: MockScenarioStep[];
  resumeSteps?: MockScenarioResumeSteps | undefined;
}

export type MockScenarioResumeSteps =
  | MockScenarioStep[]
  | {
      resolved: MockScenarioStep[];
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
