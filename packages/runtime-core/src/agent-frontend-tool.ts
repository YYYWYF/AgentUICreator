import type { AgentProducer } from "./agent-producer.js";

export interface AgentFrontendToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface AgentFrontendToolCall {
  id: string;
  name: string;
  input: unknown;
  producer: AgentProducer;
  parentMessageId?: string | undefined;
}

export interface AgentFrontendToolResult {
  content: string;
  error?: string | undefined;
}

export interface AgentFrontendToolExecuteOptions {
  signal: AbortSignal;
}

export interface AgentFrontendToolSource {
  listTools(): readonly AgentFrontendToolDefinition[];
  execute(
    call: AgentFrontendToolCall,
    options: AgentFrontendToolExecuteOptions,
  ): Promise<AgentFrontendToolResult>;
}
