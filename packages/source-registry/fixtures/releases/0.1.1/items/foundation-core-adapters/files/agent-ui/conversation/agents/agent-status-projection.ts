import type { ConversationToolCallStatus } from "@agent-ui/react";

export type AgentStatusState = "working" | "waiting" | "done";

export interface AgentStatusViewModel {
  readonly state: AgentStatusState;
  readonly label: string;
  readonly elapsed?: string;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null
    ? value as Record<string, unknown>
    : undefined;
}

function stateFromToolStatus(
  status: ConversationToolCallStatus,
): AgentStatusState | null {
  if (status.type === "running") return "working";
  if (status.type === "requires-action") return "waiting";
  if (status.type === "complete") return "done";
  return null;
}

/**
 * Projects presentation data from Tool args while deriving lifecycle state
 * from the canonical ConversationToolCall status.
 */
export function projectAgentStatus(
  value: unknown,
  status: ConversationToolCallStatus,
): AgentStatusViewModel | null {
  const record = asRecord(value);
  const state = stateFromToolStatus(status);
  if (
    record === undefined ||
    state === null ||
    typeof record.label !== "string" ||
    record.label.trim().length === 0
  ) {
    return null;
  }

  if (record.elapsed !== undefined) {
    if (
      typeof record.elapsed !== "string" ||
      record.elapsed.trim().length === 0
    ) {
      return null;
    }
    return {
      state,
      label: record.label,
      elapsed: record.elapsed,
    };
  }

  return { state, label: record.label };
}
