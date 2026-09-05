/** Identifies the Agent invocation that produced a runtime projection. */
export type AgentProducer =
  | { type: "root" }
  | { type: "subagent"; id: string };
