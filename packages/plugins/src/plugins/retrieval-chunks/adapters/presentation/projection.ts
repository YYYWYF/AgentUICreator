import type { ConversationToolCallProps, RetrievalChunk } from "../../../../public.js";
function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" ? value as Record<string, unknown> : {};
}

export function projectRetrievalChunks(props: ConversationToolCallProps) {
  const searching = props.status.type === "running";
  const raw = record(props.result).chunks;
  const chunks = Array.isArray(raw) ? raw.filter((value): value is RetrievalChunk => {
    const item = record(value);
    return typeof item.id === "string" && typeof item.source === "string" && typeof item.locator === "string" && typeof item.text === "string" && typeof item.score === "number" && Number.isFinite(item.score);
  }) : [];
  if (props.isError || props.status.type === "incomplete" || props.status.type === "requires-action" || (!searching && (!Array.isArray(raw) || chunks.length !== raw.length))) return null;
  const query = record(props.args).query;
  return { query: typeof query === "string" ? query : "", chunks, searching };
}
