import { type AGUIEvent, type RunAgentInput } from "@ag-ui/core";
import { type MockScenario } from "./scenario.js";
export interface MockScenarioRunnerOptions {
    signal?: AbortSignal | undefined;
    createId?: ((prefix: string) => string) | undefined;
    timingScale?: number | undefined;
}
/** Converts a high-level scenario into the same standard AG-UI events as a backend. */
export declare function runMockScenario(input: RunAgentInput, scenario: MockScenario, options?: MockScenarioRunnerOptions): AsyncGenerator<AGUIEvent>;
//# sourceMappingURL=scenario-runner.d.ts.map