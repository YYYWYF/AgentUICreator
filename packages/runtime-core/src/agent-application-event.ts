import type { AgentProducer } from "./agent-producer.js";

export interface AgentApplicationEvent<TPayload = unknown> {
  name: string;
  payload: TPayload;
  producer: AgentProducer;
}

export type AgentApplicationEventListener = (
  event: AgentApplicationEvent,
) => void;
