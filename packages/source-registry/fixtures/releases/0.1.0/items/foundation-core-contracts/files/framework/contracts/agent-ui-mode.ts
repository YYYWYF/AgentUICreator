import { z } from "zod";

import type { AgentUIWorkspacePolicy } from "./agent-ui-workspace";

export const AGENT_UI_MODES = [
  "assistant",
  "embedded",
  "platform",
] as const;

export const agentUIModeSchema = z.enum(AGENT_UI_MODES);

export type AgentUIMode = z.infer<typeof agentUIModeSchema>;

export interface AgentUIModeDefinition {
  readonly id: AgentUIMode;

  /** Determines which logical Workspace Regions the Mode can materialize. */
  readonly workspace: AgentUIWorkspacePolicy;

  /** Canonical initialization preset; Runtime must not consume this field. */
  readonly defaultPresetId: string;
}

export function parseAgentUIMode(input: unknown): AgentUIMode {
  return agentUIModeSchema.parse(input);
}
