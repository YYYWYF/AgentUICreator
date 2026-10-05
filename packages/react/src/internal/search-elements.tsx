import { Children, cloneElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { WebSearch as UpstreamWebSearch } from "./vendor/assistant-ui/components/assistant-ui/elements/web-search.js";
import { RetrievalChunks as UpstreamRetrievalChunks } from "./vendor/assistant-ui/components/assistant-ui/elements/retrieval-chunks.js";

// These pinned upstream Elements are pure presentation functions. Localize their
// returned presentation tree at the facade edge without patching vendor source.
function localizeStatus(tree: ReactElement, label: string): ReactElement {
  const children = Children.toArray((tree.props as { children: ReactNode }).children);
  const status = children[1] as ReactElement<{ children: ReactElement<{ children: ReactNode }> }>;
  children[1] = cloneElement(status, undefined, cloneElement(status.props.children, undefined, label));
  return cloneElement(tree as ReactElement<{ children: ReactNode }>, undefined, children);
}

function localizeMeters(node: ReactNode, labels: { relevance: string; score: string }): ReactNode {
  return Children.map(node, child => {
    if (!isValidElement(child)) return child;
    const element = child as ReactElement<Record<string, unknown>>;
    const props = element.props;
    const meterLabels = props.role === "meter" ? {
      "aria-label": labels.relevance.replace("{source}", String(props["aria-label"]).replace(/ relevance score$/, "")),
      "aria-valuetext": labels.score.replace("{score}", String(props["aria-valuetext"]).replace(/ of 1\.00$/, "")),
    } : {};
    return cloneElement(element, meterLabels, localizeMeters(props.children as ReactNode, labels));
  });
}

export interface WebSearchResult { title: string; domain: string }
export interface WebSearchProps {
  query: string;
  results: readonly WebSearchResult[];
  searching: boolean;
  labels: { searching: string; complete: string };
}
export function WebSearch({ labels, ...props }: WebSearchProps) {
  return localizeStatus(UpstreamWebSearch({ ...props, visibleResults: props.results.length, cycle: 0 }),
    props.searching ? labels.searching : labels.complete.replace("{count}", String(props.results.length)));
}

export interface RetrievalChunk { id: string; source: string; locator: string; score: number; text: string }
export interface RetrievalChunksProps {
  query: string;
  chunks: readonly RetrievalChunk[];
  searching: boolean;
  labels: { retrieving: string; complete: string; relevance: string; score: string };
}
export function RetrievalChunks({ labels, ...props }: RetrievalChunksProps) {
  const tree = localizeStatus(UpstreamRetrievalChunks({ ...props, visibleCount: props.chunks.length }),
    props.searching ? labels.retrieving : labels.complete.replace("{count}", String(props.chunks.length)));
  return localizeMeters(tree, labels);
}
