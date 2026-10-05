import { WebSearch, ConversationToolFallback, type ConversationToolCallProps, type WebSearchResult } from "@agent-ui/react";
import { useAgentUILocale } from "../../agent-ui/i18n/useAgentUILocale";

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" ? value as Record<string, unknown> : {};
}

export function WebSearchToolUI(props: ConversationToolCallProps) {
  const labels = useAgentUILocale("searchTools");
  const searching = props.status.type === "running";
  const raw = record(props.result).results;
  const results = Array.isArray(raw) ? raw.filter((value): value is WebSearchResult => {
    const item = record(value);
    return typeof item.title === "string" && typeof item.domain === "string";
  }) : [];
  if (props.isError || props.status.type === "incomplete" || props.status.type === "requires-action" ||
      (!searching && (!Array.isArray(raw) || results.length !== raw.length))) {
    return <ConversationToolFallback {...props} />;
  }
  const query = record(props.args).query;
  return <WebSearch query={typeof query === "string" ? query : ""} results={results} searching={searching}
    labels={{ searching: labels.searching, complete: labels.sources }} />;
}

// Mock release 0.1.1: exercise managed source upgrades.
