import { z } from "zod";

import type { AppUIModel } from "./app-ui-model";
import type { AgentUIWorkspacePolicy } from "./agent-ui-workspace";

export const AGENT_UI_MODES = [
  "platform",
] as const;

export const agentUIModeSchema = z.enum(AGENT_UI_MODES);

export type AgentUIMode = z.infer<typeof agentUIModeSchema>;

export interface AgentUIModeDefinition {
  readonly id: AgentUIMode;

  /** Determines which logical Workspace Regions the Mode can materialize. */
  readonly workspace: AgentUIWorkspacePolicy;

  /** Creates a fresh initial composition for this project Mode. */
  createInitialAppUIModel(): AppUIModel;
}

export function parseAgentUIMode(input: unknown): AgentUIMode {
  return agentUIModeSchema.parse(input);
}
