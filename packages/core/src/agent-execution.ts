import type { AgentProducer } from "./agent-producer.js";
import type { AgentRuntimeError } from "./agent-run.js";

export type AgentToolExecutionStatus =
  | "preparing"
  | "awaiting-result"
  | "completed"
  | "error"
  | "interrupted";

export interface AgentToolExecution {
  type: "tool";
  id: string;
  producer: AgentProducer;
  name: string;
  status: AgentToolExecutionStatus;
  arguments: string;
  parentMessageId?: string | undefined;
  result?: {
    messageId: string;
    content: string;
  } | undefined;
  error?: AgentRuntimeError | undefined;
}

export type AgentReasoningExecutionStatus =
  | "running"
  | "completed"
  | "interrupted";

export interface AgentReasoningExecution {
  type: "reasoning";
  id: string;
  producer: AgentProducer;
  status: AgentReasoningExecutionStatus;
  messageIds: string[];
}

export type AgentStepExecutionStatus =
  | "running"
  | "completed"
  | "interrupted";

export interface AgentStepExecution {
  type: "step";
  id: string;
  producer: AgentProducer;
  name: string;
  status: AgentStepExecutionStatus;
}

export type AgentSubagentExecutionStatus =
  | "running"
  | "completed"
  | "suspended"
  | "error"
  | "interrupted";

export interface AgentSubagentExecution {
  type: "subagent";
  id: string;
  producer: AgentProducer;
  name: string;
  description?: string | undefined;
  status: AgentSubagentExecutionStatus;
  parentSubagentId?: string | undefined;
  parentToolId?: string | undefined;
  parentMessageId?: string | undefined;
  error?: AgentRuntimeError | undefined;
}

/**
 * A live, current-run projection. This is intentionally not a persisted
 * conversation history or a protocol event log.
 */
export type AgentExecution =
  | AgentToolExecution
  | AgentReasoningExecution
  | AgentStepExecution
  | AgentSubagentExecution;
