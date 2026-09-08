export interface MockScenario {
  id: string;
  title: string;
  description?: string | undefined;
  initialState?: Record<string, unknown> | undefined;
  steps: MockScenarioStep[];
}

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
      prepareDurationMs?: number | undefined;
      durationMs?: number | undefined;
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
