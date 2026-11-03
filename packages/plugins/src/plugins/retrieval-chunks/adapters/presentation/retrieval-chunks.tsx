import type { ComponentProps, ComponentType, ReactNode } from "react";
import { RetrievalChunks, ConversationToolFallback, type RetrievalChunksProps, type UIPluginElementProps, type ConversationToolCallProps } from "../../../../public.js";
import { useAgentUILocale } from "../../../../plugin-support.js";
import { projectRetrievalChunks } from "./projection.js";
export interface RetrievalChunksPluginProps extends ConversationToolCallProps, UIPluginElementProps {
  query?: ComponentProps<typeof RetrievalChunks>["query"];
  chunks?: ComponentProps<typeof RetrievalChunks>["chunks"];
  searching?: ComponentProps<typeof RetrievalChunks>["searching"];
  visibleCount?: ComponentProps<typeof RetrievalChunks>["visibleCount"];
  labels?: Partial<RetrievalChunksProps["labels"]>;
  renderRetrieval?: (props: RetrievalChunksProps, tool: ConversationToolCallProps) => ReactNode;
  Fallback?: ComponentType<ConversationToolCallProps>;
}
export function CanonicalRetrievalChunks({ query, chunks, searching, visibleCount, className, style, id, role, "aria-label": ariaLabel, "aria-describedby": ariaDescription, onClick, labels, renderRetrieval, Fallback = ConversationToolFallback, ...tool }: RetrievalChunksPluginProps) {
  const rootProps = { className, style, id, role, "aria-label": ariaLabel, "aria-describedby": ariaDescription, onClick };
  const overrides = Object.fromEntries(Object.entries({ query, chunks, searching, visibleCount }).filter(([, value]) => value !== undefined));
  const defaultLabels = useAgentUILocale("searchTools");
  const view = projectRetrievalChunks(tool);
  if (view === null) return <Fallback {...tool} />;
  const props: RetrievalChunksProps = { ...view, ...overrides, ...rootProps, labels: { ...{ retrieving: defaultLabels.retrieving, complete: defaultLabels.passages, relevance: defaultLabels.relevance, score: defaultLabels.score }, ...labels } };
  return <>{renderRetrieval ? renderRetrieval(props, tool) : <RetrievalChunks {...props} />}</>;
}
