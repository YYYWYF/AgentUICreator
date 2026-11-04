import { type MockScenario, type MockScenarioCapability, type MockScenarioCategory, type MockScenarioReference, type MockScenarioResourceId } from "./scenario.js";
export interface MockScenarioSummary {
    resources?: readonly MockScenarioResourceId[] | undefined;
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
export declare function createScenarioRegistry({ scenarios, defaultScenarioId, }: CreateScenarioRegistryOptions): MockScenarioRegistry;
//# sourceMappingURL=scenario-registry.d.ts.map