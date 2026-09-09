import { z } from "zod";

import {
  agentUIModeSchema,
  type AgentUIMode,
} from "./agent-ui-mode";

export const AGENT_UI_PROJECT_CONFIG_VERSION = "1" as const;
export const LEGACY_AGENT_UI_MODE = "platform" as const satisfies AgentUIMode;

export interface AgentUIProjectConfig {
  readonly version: typeof AGENT_UI_PROJECT_CONFIG_VERSION;
  readonly mode: AgentUIMode;
}

export interface ResolvedAgentUIProjectConfig {
  readonly config: AgentUIProjectConfig;
  readonly legacy: boolean;
}

export const agentUIProjectConfigSchema: z.ZodType<AgentUIProjectConfig> =
  z.strictObject({
    version: z.literal(AGENT_UI_PROJECT_CONFIG_VERSION),
    mode: agentUIModeSchema,
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

/** Resolves pre-Mode projects without changing their AppUIModel on disk. */
export function resolveAgentUIProjectConfig(
  input: unknown | undefined,
): ResolvedAgentUIProjectConfig {
  if (input === undefined) {
    return {
      config: {
        version: AGENT_UI_PROJECT_CONFIG_VERSION,
        mode: LEGACY_AGENT_UI_MODE,
      },
      legacy: true,
    };
  }

  return {
    config: parseAgentUIProjectConfig(input),
    legacy: false,
  };
}
