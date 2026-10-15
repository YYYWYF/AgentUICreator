export type AgentRunStatus = "idle" | "running" | "awaiting-input" | "error";

export interface AgentRuntimeError {
  message: string;
  code?: string | undefined;
}

export interface AgentRunState {
  id?: string | undefined;
  status: AgentRunStatus;
  error?: AgentRuntimeError | undefined;
}
