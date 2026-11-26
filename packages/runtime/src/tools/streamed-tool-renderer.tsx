import type { ComponentType } from 'react';
import type { Toolkit } from '@assistant-ui/react';
import type { ConversationToolCallProps } from '../plugin-api/conversation.js';
import { useStreamedToolResult } from '../plugin-api/tool-results.js';

function createStreamedToolRenderer(Render: ComponentType<ConversationToolCallProps>) {
  return function StreamedToolRenderer(props: ConversationToolCallProps) {
    return <Render {...useStreamedToolResult(props)} />;
  };
}

/** Decorate presentation only; preserve tool schemas, executors and interaction callbacks. */
export function withStreamedToolResults(toolkit: Toolkit): Toolkit {
  return Object.fromEntries(Object.entries(toolkit).map(([name, entry]) => [name, entry.render
    ? { ...entry, render: createStreamedToolRenderer(entry.render as unknown as ComponentType<ConversationToolCallProps>) }
    : entry])) as Toolkit;
}
