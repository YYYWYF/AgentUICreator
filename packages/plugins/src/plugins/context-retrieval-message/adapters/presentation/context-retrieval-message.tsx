import { useState, type ComponentProps, type ReactNode } from "react";
import type { DataMessageUIRenderProps } from "../../../../public.js";
import { formatPresentationMessage, useAgentUILocale } from "../../../../plugin-support.js";
import { projectContextRetrievalData, type ContextRetrievalData } from "./projection.js";

export interface ContextRetrievalMessageProps extends DataMessageUIRenderProps<unknown>, Omit<ComponentProps<"details">, "children" | "title" | "open" | "onToggle"> {

  title?: ReactNode;
  expanded?: boolean;
  defaultExpanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
  renderContent?: (data: ContextRetrievalData, defaultContent: ReactNode) => ReactNode;
}

export type { ContextRetrievalData, ContextRetrievalGroup } from "./projection.js";

function sourceTitle(source: string, labels: { contextKnowledgeBase: string; contextLongTermMemory: string }): string {
  if (source === "rag") return labels.contextKnowledgeBase;
  if (source === "long_term_memory") return labels.contextLongTermMemory;
  return source;
}

export function CanonicalContextRetrievalMessage({ data, title: customTitle, renderContent, expanded, defaultExpanded = false, onExpandedChange, ...rootProps}: ContextRetrievalMessageProps) {
  const [internalExpanded, setInternalExpanded] = useState(defaultExpanded);
  const isExpanded = expanded ?? internalExpanded;
  const labels = useAgentUILocale("searchTools");
  const result: ContextRetrievalData | null = projectContextRetrievalData(data);
  if (result === null) return null;

  const title = sourceTitle(result.source, labels);
  const count = result.content.reduce((total, group) => total + group.context.length, 0);

  const content = (<div className="agent-ui-context-retrieval-message__body">
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
    </div>);

  return <details {...rootProps} open={isExpanded} onToggle={event => { const next = event.currentTarget.open; if (next === isExpanded) return; if (expanded === undefined) setInternalExpanded(next); else event.currentTarget.open = expanded; onExpandedChange?.(next); }} className={["agent-ui-context-retrieval-message", rootProps?.className].filter(Boolean).join(" ")} data-slot="context-retrieval-message">
    <summary>
      <span className="agent-ui-context-retrieval-message__icon" aria-hidden="true">
        <svg viewBox="0 0 16 16"><circle cx="6.8" cy="6.8" r="4.5" /><path d="m10.2 10.2 3.1 3.1" /></svg>
      </span>
      <span className="agent-ui-context-retrieval-message__heading">
        <span className="agent-ui-context-retrieval-message__title">{customTitle ?? title}</span>
      </span>
      <span className="agent-ui-context-retrieval-message__count">
        {formatPresentationMessage(labels.contextCount, { count })}
      </span>
    </summary>
    {renderContent ? renderContent(result, content) : content}
  </details>;
}
