export type AgentRunStatus = "idle" | "running" | "error";

export interface AgentRuntimeError {
  message: string;
  code?: string | undefined;
}

export interface AgentRunState {
  id?: string | undefined;
  status: AgentRunStatus;
  error?: AgentRuntimeError | undefined;
}
