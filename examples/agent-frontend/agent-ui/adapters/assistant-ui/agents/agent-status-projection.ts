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

function isAgentStatusState(value: unknown): value is AgentStatusState {
  return value === "working" || value === "waiting" || value === "done";
}

/**
 * Projects only an explicitly supplied status semantic. In particular, this
 * never derives a label from a tool name or fabricates elapsed time.
 */
export function projectAgentStatus(
  value: unknown,
): AgentStatusViewModel | null {
  const record = asRecord(value);
  if (
    record === undefined ||
    !isAgentStatusState(record.state) ||
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
      state: record.state,
      label: record.label,
      elapsed: record.elapsed,
    };
  }

  return { state: record.state, label: record.label };
}
