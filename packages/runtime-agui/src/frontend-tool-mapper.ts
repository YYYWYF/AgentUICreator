import type { Tool } from "@ag-ui/core";
import type { AgentFrontendToolDefinition } from "@agent-ui/runtime-core";

export function mapFrontendToolDefinition(
  definition: AgentFrontendToolDefinition,
): Tool {
  return {
    name: definition.name,
    description: definition.description,
    parameters: structuredClone(definition.inputSchema),
  };
}
