import type { IncomingMessage, ServerResponse } from "node:http";
import { type AGUIEvent, type RunAgentInput } from "@ag-ui/core";
import type { MockScenarioRegistry } from "./scenario-registry.js";
import { type MockDurableRunStore } from "./durable-run-store.js";
export interface MockAgentHttpHandlerOptions {
    registry: MockScenarioRegistry;
    resolveRun?: MockRunResolver;
    /** Run creation and history/resume must share the same development store. */
    durableStore?: MockDurableRunStore;
}
export type MockRunResolver = (input: RunAgentInput, request: {
    scenarioId?: string;
    speed: number;
    signal: AbortSignal;
}) => AsyncIterable<AGUIEvent> | Promise<AsyncIterable<AGUIEvent>>;
export declare function createScenarioMockRunResolver(registry: MockScenarioRegistry): MockRunResolver;
export type MockAgentHttpHandler = (request: IncomingMessage, response: ServerResponse) => Promise<void>;
/** Creates a Node HTTP handler compatible with @ag-ui/client HttpAgent. */
export declare function createMockAgentHttpHandler({ registry, resolveRun, durableStore, }: MockAgentHttpHandlerOptions): MockAgentHttpHandler;
//# sourceMappingURL=http-handler.d.ts.map