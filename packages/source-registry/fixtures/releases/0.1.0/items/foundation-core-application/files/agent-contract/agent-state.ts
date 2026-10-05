export interface AppAgentState {
  agentUI?: Record<string, unknown> | undefined;
  selectedFile?: string | undefined;
  files?: Record<string, unknown> | undefined;
  attachments?: unknown[] | undefined;
  sources?: unknown[] | undefined;
  diagrams?: unknown[] | undefined;
  [key: string]: unknown;
}
