import type { AgentFrontendToolSource } from "@agent-ui/runtime-core";

/**
 * Formal input port for the existing AgentUICreator frontend-tool policy.
 * P3R-2 records the public assistant-ui integration point without duplicating
 * transport execution. Dynamic execution parity is deferred to P3R-4.
 */
export interface AssistantUiFrontendToolPort {
  source: AgentFrontendToolSource;
  integrationPoint: "AssistantRuntime.registerModelContextProvider";
  status: "deferred";
}

export function createAssistantUiFrontendToolPort(
  source: AgentFrontendToolSource,
): AssistantUiFrontendToolPort {
  return {
    source,
    integrationPoint: "AssistantRuntime.registerModelContextProvider",
    status: "deferred",
  };
}
