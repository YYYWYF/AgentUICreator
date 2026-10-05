import { RetrievalChunks, ConversationToolFallback, type ConversationToolCallProps, type RetrievalChunk } from "@agent-ui/react";
import { useAgentUILocale } from "../../agent-ui/i18n/useAgentUILocale";

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" ? value as Record<string, unknown> : {};
}

export function RetrievalChunksToolUI(props: ConversationToolCallProps) {
  const labels = useAgentUILocale("searchTools");
  const searching = props.status.type === "running";
  const raw = record(props.result).chunks;
  const chunks = Array.isArray(raw) ? raw.filter((value): value is RetrievalChunk => {
    const item = record(value);
    return typeof item.id === "string" && typeof item.source === "string" && typeof item.locator === "string" && typeof item.text === "string" && typeof item.score === "number" && Number.isFinite(item.score);
  }) : [];
  if (props.isError || props.status.type === "incomplete" || props.status.type === "requires-action" ||
      (!searching && (!Array.isArray(raw) || chunks.length !== raw.length))) {
    return <ConversationToolFallback {...props} />;
  }
  const query = record(props.args).query;
  return <RetrievalChunks query={typeof query === "string" ? query : ""} chunks={chunks} searching={searching}
    labels={{ retrieving: labels.retrieving, complete: labels.passages, relevance: labels.relevance, score: labels.score }} />;
}
