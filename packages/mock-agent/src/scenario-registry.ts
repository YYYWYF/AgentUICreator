import type {
  MockScenario,
  MockScenarioCapability,
  MockScenarioCategory,
  MockScenarioReference,
} from "./scenario.js";

export interface MockScenarioSummary {
  id: string;
  title: string;
  description?: string | undefined;
  category?: MockScenarioCategory | undefined;
  capabilities?: readonly MockScenarioCapability[] | undefined;
  reference?: MockScenarioReference | undefined;
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
    if (scenario.id.trim().length === 0) {
      throw new Error("Mock scenario id must not be empty.");
    }
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(scenario.id)) {
      throw new Error(`Mock scenario id must be kebab-case: ${scenario.id}`);
    }
    if (scenario.title.trim().length === 0) {
      throw new Error(`Mock scenario title must not be empty: ${scenario.id}`);
    }
    if (scenarioById.has(scenario.id)) {
      throw new Error(`Duplicate mock scenario id: ${scenario.id}`);
    }
    if (scenario.capabilities !== undefined) {
      const capabilities = new Set(scenario.capabilities);
      if (capabilities.size !== scenario.capabilities.length) {
        throw new Error(
          `Duplicate mock scenario capability: ${scenario.id}`,
        );
      }
    }
    scenarioById.set(scenario.id, scenario);
  }

  const defaultScenario = scenarioById.get(defaultScenarioId);
  if (defaultScenario === undefined) {
    throw new Error(`Unknown default mock scenario: ${defaultScenarioId}`);
  }

  const summaries = scenarios.map(({
    id,
    title,
    description,
    category,
    capabilities,
    reference,
  }) => ({
    id,
    title,
    ...(description === undefined ? {} : { description }),
    ...(category === undefined ? {} : { category }),
    ...(capabilities === undefined ? {} : {
      capabilities: [...capabilities],
    }),
    ...(reference === undefined ? {} : {
      reference: {
        ...reference,
        ...(reference.eventFlow === undefined ? {} : {
          eventFlow: [...reference.eventFlow],
        }),
        ...(reference.notes === undefined ? {} : {
          notes: [...reference.notes],
        }),
      },
    }),
  }));

  return {
    defaultScenarioId,
    list: () => summaries.map((summary) => ({ ...summary })),
    get: (id) => scenarioById.get(id),
    getDefault: () => defaultScenario,
  };
}
