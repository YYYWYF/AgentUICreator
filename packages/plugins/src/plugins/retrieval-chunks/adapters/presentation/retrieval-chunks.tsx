import type { ComponentProps, ComponentType, ReactNode } from 'react';
import {
  ConversationToolFallback,
  RetrievalChunks,
  type ConversationToolCallProps,
  type RetrievalChunksProps,
  type UIPluginElementProps,
} from '../../../../public.js';
import { projectRetrievalChunks } from './projection.js';
export interface RetrievalChunksPluginProps extends ConversationToolCallProps, UIPluginElementProps {
  query?: ComponentProps<typeof RetrievalChunks>['query'];
  chunks?: ComponentProps<typeof RetrievalChunks>['chunks'];
  searching?: ComponentProps<typeof RetrievalChunks>['searching'];
  visibleCount?: ComponentProps<typeof RetrievalChunks>['visibleCount'];
  renderRetrieval?: (props: RetrievalChunksProps, tool: ConversationToolCallProps) => ReactNode;
  Fallback?: ComponentType<ConversationToolCallProps>;
}
export function CanonicalRetrievalChunks({
  query,
  chunks,
  searching,
  visibleCount,
  className,
  style,
  id,
  role,
  'aria-label': ariaLabel,
  'aria-describedby': ariaDescription,
  onClick,
  renderRetrieval,
  Fallback = ConversationToolFallback,
  ...tool
}: RetrievalChunksPluginProps) {
  const rootProps = {
    className,
    style,
    id,
    role,
    'aria-label': ariaLabel,
    'aria-describedby': ariaDescription,
    onClick,
  };
  const overrides = Object.fromEntries(
    Object.entries({ query, chunks, searching, visibleCount }).filter(([, value]) => value !== undefined),
  );
  const view = projectRetrievalChunks(tool);
  if (view === null) {
    return <Fallback {...tool} />;
  }
  const props: RetrievalChunksProps = {
    ...view,
    ...overrides,
    ...rootProps,

  };
  return <>{renderRetrieval ? renderRetrieval(props, tool) : <RetrievalChunks {...props} />}</>;
}
