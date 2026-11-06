import { WebSearch as UpstreamWebSearch } from "./adapters-generated/assistant-ui/components/assistant-ui/elements/web-search.js";
import { RetrievalChunks as UpstreamRetrievalChunks } from "./adapters-generated/assistant-ui/components/assistant-ui/elements/retrieval-chunks.js";

import type { WebSearchProps, RetrievalChunksProps } from "../public.js";

export function WebSearch({ labels, visibleResults, cycle = 0, ...props }: WebSearchProps & { labels: { searching: string; complete: string } }) {
  return <UpstreamWebSearch {...props} labels={labels} visibleResults={visibleResults ?? props.results.length} cycle={cycle} />;
}

export function RetrievalChunks({ labels, visibleCount, ...props }: RetrievalChunksProps & { labels: { retrieving: string; complete: string; relevance: string; score: string } }) {
  return <UpstreamRetrievalChunks {...props} labels={labels} visibleCount={visibleCount ?? props.chunks.length} />;
}
