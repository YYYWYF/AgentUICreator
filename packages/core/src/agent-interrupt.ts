import type { AgentProducer } from "./agent-producer.js";

export interface AgentInterrupt {
  id: string;
  reason: string;
  message?: string | undefined;
  producer: AgentProducer;
  toolExecutionId?: string | undefined;
  responseSchema?: Record<string, unknown> | undefined;
  expiresAt?: string | undefined;
  metadata?: Record<string, unknown> | undefined;
}

export type AgentInterruptResponseStatus = "resolved" | "cancelled";

export interface AgentInterruptResponse {
  interruptId: string;
  status: AgentInterruptResponseStatus;
  payload?: unknown;
  metadata?: Record<string, unknown> | undefined;
}
