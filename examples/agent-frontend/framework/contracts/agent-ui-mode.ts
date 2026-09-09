import { z } from "zod";

import type { AppUIModel } from "./app-ui-model";

export const AGENT_UI_MODES = [
  "assistant",
  "embedded",
  "platform",
] as const;

export const agentUIModeSchema = z.enum(AGENT_UI_MODES);

export type AgentUIMode = z.infer<typeof agentUIModeSchema>;

export interface AgentUIModeDefinition {
  readonly id: AgentUIMode;

  /** Creates a fresh initial composition for this project Mode. */
  createInitialAppUIModel(): AppUIModel;
}

export function parseAgentUIMode(input: unknown): AgentUIMode {
  return agentUIModeSchema.parse(input);
}
