import { z } from "zod";

import {
  agentUIModeSchema,
  type AgentUIMode,
} from "./agent-ui-mode.js";

export interface AgentUIProjectConfig {
  /** Existing project metadata remains readable; new projects do not persist a mode. */
  readonly mode?: AgentUIMode | undefined;
  readonly sourceRoot: string;
}

export const agentUIProjectConfigSchema: z.ZodType<AgentUIProjectConfig> =
  z.strictObject({
    mode: agentUIModeSchema.optional(),
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
