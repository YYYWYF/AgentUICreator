import type { MockScenario } from "./scenario.js";

export interface MockScenarioSummary {
  id: string;
  title: string;
  description?: string | undefined;
}

export interface MockScenarioRegistry {
  readonly defaultScenarioId: string;
  list(): MockScenarioSummary[];
  get(id: string): MockScenario | undefined;
  getDefault(): MockScenario;
}

export interface CreateScenarioRegistryOptions {
  scenarios: MockScenario[];
  defaultScenarioId: string;
}

export function createScenarioRegistry({
  scenarios,
  defaultScenarioId,
}: CreateScenarioRegistryOptions): MockScenarioRegistry {
  if (scenarios.length === 0) {
    throw new Error("Mock scenario registry requires at least one scenario.");
  }

  const scenarioById = new Map<string, MockScenario>();
  for (const scenario of scenarios) {
    if (scenarioById.has(scenario.id)) {
      throw new Error(`Duplicate mock scenario id: ${scenario.id}`);
    }
    scenarioById.set(scenario.id, scenario);
  }

  const defaultScenario = scenarioById.get(defaultScenarioId);
  if (defaultScenario === undefined) {
    throw new Error(`Unknown default mock scenario: ${defaultScenarioId}`);
  }

  const summaries = scenarios.map(({ id, title, description }) => ({
    id,
    title,
    ...(description === undefined ? {} : { description }),
  }));

  return {
    defaultScenarioId,
    list: () => summaries.map((summary) => ({ ...summary })),
    get: (id) => scenarioById.get(id),
    getDefault: () => defaultScenario,
  };
}
