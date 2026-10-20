import type { DataMessageUIRenderProps } from "../../../../public.js";
import { formatPresentationMessage, useAgentUILocale } from "../../../../plugin-support.js";
import { projectContextRetrievalData, type ContextRetrievalData } from "./projection.js";

export interface ContextRetrievalMessageProps extends DataMessageUIRenderProps<unknown> {}

export type { ContextRetrievalData, ContextRetrievalGroup } from "./projection.js";

function sourceTitle(source: string, labels: { contextKnowledgeBase: string; contextLongTermMemory: string }): string {
  if (source === "rag") return labels.contextKnowledgeBase;
  if (source === "long_term_memory") return labels.contextLongTermMemory;
  return source;
}

export function CanonicalContextRetrievalMessage({ data }: ContextRetrievalMessageProps) {
  const labels = useAgentUILocale("searchTools");
  const result: ContextRetrievalData | null = projectContextRetrievalData(data);
  if (result === null) return null;

  const title = sourceTitle(result.source, labels);
  const count = result.content.reduce((total, group) => total + group.context.length, 0);

  return <details className="agent-ui-context-retrieval-message" data-slot="context-retrieval-message">
    <summary>
      <span className="agent-ui-context-retrieval-message__icon" aria-hidden="true">
        <svg viewBox="0 0 16 16"><circle cx="6.8" cy="6.8" r="4.5" /><path d="m10.2 10.2 3.1 3.1" /></svg>
      </span>
      <span className="agent-ui-context-retrieval-message__heading">
        <span className="agent-ui-context-retrieval-message__title">{title}</span>
      </span>
      <span className="agent-ui-context-retrieval-message__count">
        {formatPresentationMessage(labels.contextCount, { count })}
      </span>
    </summary>
    <div className="agent-ui-context-retrieval-message__body">
      {result.content.map((group, groupIndex) => <section className="agent-ui-context-retrieval-message__group" key={`${group.query}:${groupIndex}`}>
        <p className="agent-ui-context-retrieval-message__query">
          <span className="agent-ui-context-retrieval-message__query-label">{labels.contextQuery}</span>
          <span>{group.query}</span>
        </p>
        {group.context.length > 0
          ? <ul className="agent-ui-context-retrieval-message__snippets">
              {group.context.map((snippet, snippetIndex) => <li className="agent-ui-context-retrieval-message__snippet" key={snippetIndex}>{snippet}</li>)}
            </ul>
          : <p className="agent-ui-context-retrieval-message__empty">{labels.contextEmpty}</p>}
      </section>)}
    </div>
  </details>;
}
