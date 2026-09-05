/** Frontend-owned message data used by the existing UI plugins. */
interface AgentMessageBase {
  id: string;
  // Conversation ids, sources and rendering hints are application-owned data.
  metadata?: Record<string, unknown> | undefined;
}

/** Text and attachment display fields; transport-only payloads stay in the adapter. */
export interface AgentMessagePart {
  type: string;
  text?: string | undefined;
  filename?: string | undefined;
  url?: string | undefined;
  source?: { type: string; value: string } | undefined;
  metadata?: unknown;
}

export interface AgentToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

/**
 * Keep the role distinctions consumed by chat, reasoning and tool/activity UI.
 * This contract deliberately excludes SDK routing and encrypted replay fields.
 */
export type AgentMessage = AgentMessageBase & (
  | { role: "user"; content: string | AgentMessagePart[] }
  | {
      role: "assistant";
      content?: string | undefined;
      toolCalls?: AgentToolCall[] | undefined;
    }
  | { role: "system" | "developer"; content: string }
  | { role: "reasoning"; content: string }
  | {
      role: "tool";
      toolCallId: string;
      content: string;
      error?: string | undefined;
    }
  | {
      role: "activity";
      activityType: string;
      content: Record<string, unknown>;
    }
);
