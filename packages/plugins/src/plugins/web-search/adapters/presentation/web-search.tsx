import type { ComponentType, ReactNode } from "react";
import { WebSearch, ConversationToolFallback, type WebSearchProps, type ConversationToolCallProps } from "../../../../public.js";
import { useAgentUILocale } from "../../../../plugin-support.js";
import { projectWebSearch } from "./projection.js";
export interface WebSearchPluginProps extends ConversationToolCallProps {
  searchProps?: Omit<Partial<WebSearchProps>, "labels"> & { labels?: Partial<WebSearchProps["labels"]> };
  renderSearch?: (props: WebSearchProps, tool: ConversationToolCallProps) => ReactNode;
  Fallback?: ComponentType<ConversationToolCallProps>;
}
export function CanonicalWebSearch({ searchProps, renderSearch, Fallback = ConversationToolFallback, ...tool }: WebSearchPluginProps) {
  const labels = useAgentUILocale("searchTools");
  const view = projectWebSearch(tool);
  if (view === null) return <Fallback {...tool} />;
  const props: WebSearchProps = { ...view, ...searchProps, labels: { ...{ searching: labels.searching, complete: labels.sources }, ...searchProps?.labels } };
  return <>{renderSearch ? renderSearch(props, tool) : <WebSearch {...props} />}</>;
}
