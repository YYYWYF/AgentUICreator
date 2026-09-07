export interface MockScenario {
  id: string;
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
      durationMs?: number | undefined;
    }
  | {
      type: "message";
      text: string;
      intervalMs?: number | undefined;
    };

export function defineScenario(scenario: MockScenario): MockScenario {
  return scenario;
}
