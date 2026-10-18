import type { ComponentType, ReactNode } from "react";
import { RetrievalChunks, ConversationToolFallback, type RetrievalChunksProps, type ConversationToolCallProps } from "../../../../public.js";
import { useAgentUILocale } from "../../../../plugin-support.js";
import { projectRetrievalChunks } from "./projection.js";
export interface RetrievalChunksPluginProps extends ConversationToolCallProps {
  retrievalProps?: Omit<Partial<RetrievalChunksProps>, "labels"> & { labels?: Partial<RetrievalChunksProps["labels"]> };
  renderRetrieval?: (props: RetrievalChunksProps, tool: ConversationToolCallProps) => ReactNode;
  Fallback?: ComponentType<ConversationToolCallProps>;
}
export function CanonicalRetrievalChunks({ retrievalProps, renderRetrieval, Fallback = ConversationToolFallback, ...tool }: RetrievalChunksPluginProps) {
  const labels = useAgentUILocale("searchTools");
  const view = projectRetrievalChunks(tool);
  if (view === null) return <Fallback {...tool} />;
  const props: RetrievalChunksProps = { ...view, ...retrievalProps, labels: { ...{ retrieving: labels.retrieving, complete: labels.passages, relevance: labels.relevance, score: labels.score }, ...retrievalProps?.labels } };
  return <>{renderRetrieval ? renderRetrieval(props, tool) : <RetrievalChunks {...props} />}</>;
}
