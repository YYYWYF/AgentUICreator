import type { ComponentProps, ComponentType, ReactNode } from "react";
import { WebSearch, ConversationToolFallback, type WebSearchProps, type UIPluginElementProps, type ConversationToolCallProps } from "../../../../public.js";
import { useAgentUILocale } from "../../../../plugin-support.js";
import { projectWebSearch } from "./projection.js";
export interface WebSearchPluginProps extends ConversationToolCallProps, UIPluginElementProps {
  query?: ComponentProps<typeof WebSearch>["query"];
  results?: ComponentProps<typeof WebSearch>["results"];
  searching?: ComponentProps<typeof WebSearch>["searching"];
  visibleResults?: ComponentProps<typeof WebSearch>["visibleResults"];
  cycle?: ComponentProps<typeof WebSearch>["cycle"];
  labels?: Partial<WebSearchProps["labels"]>;
  renderSearch?: (props: WebSearchProps, tool: ConversationToolCallProps) => ReactNode;
  Fallback?: ComponentType<ConversationToolCallProps>;
}
export function CanonicalWebSearch({ query, results, searching, visibleResults, cycle, className, style, id, role, "aria-label": ariaLabel, "aria-describedby": ariaDescription, onClick, labels, renderSearch, Fallback = ConversationToolFallback, ...tool }: WebSearchPluginProps) {
  const rootProps = { className, style, id, role, "aria-label": ariaLabel, "aria-describedby": ariaDescription, onClick };
  const overrides = Object.fromEntries(Object.entries({ query, results, searching, visibleResults, cycle }).filter(([, value]) => value !== undefined));
  const defaultLabels = useAgentUILocale("searchTools");
  const view = projectWebSearch(tool);
  if (view === null) return <Fallback {...tool} />;
  const props: WebSearchProps = { ...view, ...overrides, ...rootProps, labels: { ...{ searching: defaultLabels.searching, complete: defaultLabels.sources }, ...labels } };
  return <>{renderSearch ? renderSearch(props, tool) : <WebSearch {...props} />}</>;
}
