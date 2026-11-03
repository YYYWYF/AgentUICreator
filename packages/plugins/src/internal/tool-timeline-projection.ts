import { hasToolResultParts } from "../plugins/tool-result/adapters/presentation/content.js";

/** Presentation projection only. Identity and lifecycle come from assistant-ui parts. */
export interface TimelinePart {
  readonly type: string;
  readonly toolCallId?: string;
  readonly toolName?: string;
  readonly text?: string;
  readonly args?: unknown;
  readonly result?: unknown;
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
  readonly target: string;
}
function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function toolTarget(part: TimelinePart): string {
  const args = record(part.args);
  // Targets are presentation data, not a source of tool semantics. Preserve
  // native paths (including Windows paths); never resolve them on this host.
  const kind = timelineToolKind(part.toolName ?? "");
  const keys = kind === "command" ? ["command", "cmd"]
    : kind === "search" ? ["query", "pattern", "path", "url"]
    : ["path", "file_path", "filePath", "filename", "command", "cmd", "query", "pattern", "url", "name"];
  for (const key of keys) {
    const value = args[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return part.toolCallId ?? "";
}
export function hasPendingToolAction(part: TimelinePart): boolean {
  if (part.status?.type === "requires-action") return true;
  const approval = part.approval;
  if (typeof approval === "object" && approval !== null &&
      (approval as { approved?: unknown }).approved === undefined &&
      (approval as { resolution?: unknown }).resolution === undefined) return true;
  return part.interrupt != null && part.status?.type !== "complete" && part.status?.type !== "incomplete";
}
export function projectToolTimeline(parts: readonly TimelinePart[], namedTools: Readonly<Record<string, readonly unknown[] | undefined>> = {}) {
  const seen = new Set<string>();
  const calls: TimelineCall[] = [];
  parts.forEach((part, index) => {
    if (part.type !== "tool-call" || !part.toolCallId || seen.has(part.toolCallId)) return;
    seen.add(part.toolCallId);
    const status = part.isError ? "incomplete" : part.status?.type ?? "unknown";
    const protectedCall = status === "incomplete" || hasPendingToolAction(part) || hasToolResultParts(part.result);
    calls.push({ toolCallId: part.toolCallId, toolName: part.toolName ?? "", index, status,
      reason: part.isError ? "error" : part.status?.reason,
      summarized: part.messages === undefined && !part.mcp && !namedTools[part.toolName ?? ""]?.length,
      protected: protectedCall, target: toolTarget(part) });
  });
  const summarized = calls.filter(call => call.summarized);
  const stats = new Map<string, { file: string; added?: number; removed?: number }>();
  for (const call of calls) {
    if (timelineToolKind(call.toolName) !== "edit" || call.status !== "complete") continue;
    const result = record(parts[call.index]?.result);
    if (typeof result.file !== "string" || !result.file.trim()) continue;
    const stat = stats.get(result.file) ?? { file: result.file };
    for (const key of ["added", "removed"] as const) {
      const value = result[key];
      if (typeof value === "number" && Number.isInteger(value) && value >= 0) stat[key] = (stat[key] ?? 0) + value;
    }
    stats.set(stat.file, stat);
  }
  return { calls, summarized, stats: [...stats.values()], anchorId: summarized[0]?.toolCallId,
    streaming: calls.some(call => call.status === "running"),
    detailIndices: summarized.filter(call => !call.protected).map(call => call.index) };
}

// Exact tool-name allowlist. Arguments and model output never determine semantics.
export function timelineToolKind(name: string): "read" | "command" | "search" | "edit" | "tool" {
  if (["read_file", "readFile", "read", "Read"].includes(name)) return "read";
  if (["exec_command", "execute_command", "run_command", "bash", "Bash"].includes(name)) return "command";
  if (["search", "search_files", "web_search", "grep", "Grep", "Glob"].includes(name)) return "search";
  if (["edit_file", "editFile", "write_file", "writeFile", "Edit", "Write", "apply_patch"].includes(name)) return "edit";
  return "tool";
}
