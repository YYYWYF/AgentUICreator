import { WebSearch as UpstreamWebSearch } from "./adapters/assistant-ui/components/assistant-ui/elements/web-search.js";
import { RetrievalChunks as UpstreamRetrievalChunks } from "./adapters/assistant-ui/components/assistant-ui/elements/retrieval-chunks.js";

export interface WebSearchResult { title: string; domain: string }
export interface WebSearchProps {
  query: string;
  results: readonly WebSearchResult[];
  searching: boolean;
  labels: { searching: string; complete: string };
}
export function WebSearch({ labels, ...props }: WebSearchProps) {
  return <UpstreamWebSearch {...props} labels={labels} visibleResults={props.results.length} cycle={0} />;
}

export interface RetrievalChunk { id: string; source: string; locator: string; score: number; text: string }
export interface RetrievalChunksProps {
  query: string;
  chunks: readonly RetrievalChunk[];
  searching: boolean;
  labels: { retrieving: string; complete: string; relevance: string; score: string };
}
export function RetrievalChunks({ labels, ...props }: RetrievalChunksProps) {
  return <UpstreamRetrievalChunks {...props} labels={labels} visibleCount={props.chunks.length} />;
}
