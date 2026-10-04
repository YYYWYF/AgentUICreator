import { z } from "zod";

import {
  agentUIModeSchema,
  type AgentUIMode,
} from "./agent-ui-mode";

export interface AgentUIProjectConfig {
  readonly mode: AgentUIMode;
  readonly sourceRoot: string;
}

export const agentUIProjectConfigSchema: z.ZodType<AgentUIProjectConfig> =
  z.strictObject({
    mode: agentUIModeSchema,
    sourceRoot: z.string().min(1),
  });

export function parseAgentUIProjectConfig(
  input: unknown,
): AgentUIProjectConfig {
  return agentUIProjectConfigSchema.parse(input);
}

export function parseAgentUIProjectConfigJson(
  source: string,
): AgentUIProjectConfig {
  return parseAgentUIProjectConfig(JSON.parse(source));
}
