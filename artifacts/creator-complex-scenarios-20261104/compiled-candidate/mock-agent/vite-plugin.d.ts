import type { Plugin } from "vite";
import type { MockScenario } from "./scenario.js";
export interface MockAgentVitePluginOptions {
    endpoint?: string | undefined;
    scenarios: MockScenario[];
    defaultScenarioId: string;
}
/** Mounts the Mock Agent only in the Vite development server. */
export declare function createMockAgentVitePlugin({ endpoint, scenarios, defaultScenarioId, }: MockAgentVitePluginOptions): Plugin;
//# sourceMappingURL=vite-plugin.d.ts.map