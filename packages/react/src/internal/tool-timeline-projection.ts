/** Presentation projection only. Identity and lifecycle come from assistant-ui parts. */
export interface TimelinePart {
  readonly type: string;
  readonly toolCallId?: string;
  readonly toolName?: string;
  readonly text?: string;
  readonly status?: { readonly type: string; readonly reason?: string };
  readonly messages?: unknown;
  readonly approval?: unknown;
  readonly interrupt?: unknown;
  readonly mcp?: unknown;
  readonly isError?: boolean | undefined;
}
export interface TimelineCall {
  readonly toolCallId: string;
  readonly toolName: string;
  readonly index: number;
  readonly status: string;
  readonly reason?: string | undefined;
  readonly summarized: boolean;
  readonly protected: boolean;
}
export function projectToolTimeline(parts: readonly TimelinePart[], namedTools: Readonly<Record<string, readonly unknown[] | undefined>> = {}) {
  const seen = new Set<string>();
  const calls: TimelineCall[] = [];
  parts.forEach((part, index) => {
    if (part.type !== "tool-call" || !part.toolCallId || seen.has(part.toolCallId)) return;
    seen.add(part.toolCallId);
    const status = part.isError ? "incomplete" : part.status?.type ?? "unknown";
    const protectedCall = status === "requires-action" || status === "incomplete" ||
      part.approval != null || part.interrupt != null;
    calls.push({ toolCallId: part.toolCallId, toolName: part.toolName ?? "", index, status,
      reason: part.isError ? "error" : part.status?.reason,
      summarized: part.messages === undefined && !part.mcp && !namedTools[part.toolName ?? ""]?.length,
      protected: protectedCall });
  });
  const summarized = calls.filter(call => call.summarized);
  return { calls, summarized, anchorId: summarized[0]?.toolCallId,
    streaming: summarized.some(call => call.status === "running"),
    detailIndices: summarized.filter(call => !call.protected).map(call => call.index) };
}

// Exact tool-name allowlist. Arguments and model output never determine semantics.
export function timelineToolKind(name: string): "read" | "command" | "search" | "tool" {
  if (["read_file", "readFile", "read", "Read"].includes(name)) return "read";
  if (["exec_command", "execute_command", "run_command", "bash", "Bash"].includes(name)) return "command";
  if (["search", "search_files", "web_search", "grep", "Grep", "Glob"].includes(name)) return "search";
  return "tool";
}
