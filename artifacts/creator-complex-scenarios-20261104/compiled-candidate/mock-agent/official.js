import { showcaseMockScenarios } from "./builtins/index.js";
import { createScenarioRegistry } from "./scenario-registry.js";
import { runMockScenario } from "./scenario-runner.js";
import { createMockAgentHttpHandler as createInternalHttpHandler } from "./http-handler.js";
import { createMockAgentVitePlugin as createInternalVitePlugin } from "./vite-plugin.js";
function registry(options) {
    // Reject removed extension options for JavaScript consumers as well as TypeScript.
    for (const key of Object.keys(options)) {
        if (key !== "defaultScenarioId" && key !== "endpoint") {
            throw new Error(`Unsupported official Mock option: ${key}`);
        }
    }
    return createScenarioRegistry({
        scenarios: showcaseMockScenarios,
        defaultScenarioId: options.defaultScenarioId ?? "reasoning-tool-success",
    });
}
/** Returns detached catalog metadata, never executable scenario definitions. */
export function listOfficialMockScenarios() {
    return structuredClone(registry({}).list());
}
/** Executes an installed official scenario by ID; custom definitions are not accepted. */
export function runOfficialMockScenario(input, scenarioId, options = {}) {
    const scenario = registry({ defaultScenarioId: scenarioId }).getDefault();
    return runMockScenario(input, scenario, { signal: options.signal, timingScale: options.timingScale });
}
export function createMockAgentHttpHandler(options = {}) {
    return createInternalHttpHandler({ registry: registry(options) });
}
/** Mounts only the installed official catalog in the development server. */
export function createMockAgentVitePlugin(options = {}) {
    const official = registry(options);
    return createInternalVitePlugin({
        endpoint: options.endpoint,
        scenarios: showcaseMockScenarios,
        defaultScenarioId: official.defaultScenarioId,
    });
}
//# sourceMappingURL=official.js.map