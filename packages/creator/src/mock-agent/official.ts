import type { AGUIEvent, RunAgentInput } from "@ag-ui/core";
import type { Plugin } from "vite";
import { showcaseMockScenarios } from "./builtins/index.js";
import { createScenarioRegistry, type MockScenarioSummary } from "./scenario-registry.js";
import { runMockScenario } from "./scenario-runner.js";
import { createMockAgentHttpHandler as createInternalHttpHandler, type MockAgentHttpHandler } from "./http-handler.js";
import { createMockAgentVitePlugin as createInternalVitePlugin } from "./vite-plugin.js";

export interface OfficialMockOptions {
  defaultScenarioId?: string;
}
export interface OfficialMockVitePluginOptions extends OfficialMockOptions {
  endpoint?: string;
}

function registry(options: OfficialMockOptions) {
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
export function listOfficialMockScenarios(): MockScenarioSummary[] {
  return structuredClone(registry({}).list());
}

/** Executes an installed official scenario by ID; custom definitions are not accepted. */
export function runOfficialMockScenario(
  input: RunAgentInput,
  scenarioId: string,
  options: { signal?: AbortSignal; timingScale?: number } = {},
): AsyncGenerator<AGUIEvent> {
  const scenario = registry({ defaultScenarioId: scenarioId }).getDefault();
  return runMockScenario(input, scenario, { signal: options.signal, timingScale: options.timingScale });
}

export function createMockAgentHttpHandler(options: OfficialMockOptions = {}): MockAgentHttpHandler {
  return createInternalHttpHandler({ registry: registry(options) });
}

/** Mounts only the installed official catalog in the development server. */
export function createMockAgentVitePlugin(options: OfficialMockVitePluginOptions = {}): Plugin {
  const official = registry(options);
  return createInternalVitePlugin({
    endpoint: options.endpoint,
    scenarios: showcaseMockScenarios,
    defaultScenarioId: official.defaultScenarioId,
  });
}
