import { WebSearch as UpstreamWebSearch } from "./adapters/assistant-ui/components/assistant-ui/elements/web-search.js";
import { RetrievalChunks as UpstreamRetrievalChunks } from "./adapters/assistant-ui/components/assistant-ui/elements/retrieval-chunks.js";

import type { WebSearchProps, RetrievalChunksProps } from "../public.js";

export function WebSearch({ labels, ...props }: WebSearchProps) {
  return <UpstreamWebSearch {...props} labels={labels} visibleResults={props.results.length} cycle={0} />;
}

export function RetrievalChunks({ labels, ...props }: RetrievalChunksProps) {
  return <UpstreamRetrievalChunks {...props} labels={labels} visibleCount={props.chunks.length} />;
}
