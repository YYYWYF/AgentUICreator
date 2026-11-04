import type { AGUIEvent, RunAgentInput } from "@ag-ui/core";
import type { Plugin } from "vite";
import { type MockScenarioSummary } from "./scenario-registry.js";
import { type MockAgentHttpHandler } from "./http-handler.js";
export interface OfficialMockOptions {
    defaultScenarioId?: string;
}
export interface OfficialMockVitePluginOptions extends OfficialMockOptions {
    endpoint?: string;
}
/** Returns detached catalog metadata, never executable scenario definitions. */
export declare function listOfficialMockScenarios(): MockScenarioSummary[];
/** Executes an installed official scenario by ID; custom definitions are not accepted. */
export declare function runOfficialMockScenario(input: RunAgentInput, scenarioId: string, options?: {
    signal?: AbortSignal;
    timingScale?: number;
}): AsyncGenerator<AGUIEvent>;
export declare function createMockAgentHttpHandler(options?: OfficialMockOptions): MockAgentHttpHandler;
/** Mounts only the installed official catalog in the development server. */
export declare function createMockAgentVitePlugin(options?: OfficialMockVitePluginOptions): Plugin;
//# sourceMappingURL=official.d.ts.map