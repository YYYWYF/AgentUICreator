import { createContext, useContext, useSyncExternalStore } from 'react';
import { useAuiState } from '@assistant-ui/react';
import type { ConversationToolCallProps } from './conversation.js';

export interface ConversationToolResultMessage {
  readonly id: string;
  readonly createdAt: Date;
  readonly role: string;
  readonly content: readonly {
    readonly type: string;
    readonly toolCallId?: string;
    readonly result?: unknown;
    readonly isPreliminary?: boolean | undefined;
    readonly messages?: readonly ConversationToolResultMessage[];
  }[];
}

/** Internal presentation port. Native tool results and lifecycle remain upstream-owned. */
export interface ConversationToolResultPort {
  readMessage<T extends ConversationToolResultMessage>(message: T): T;
  subscribe(listener: () => void): () => void;
  getRevision(): number;
}
export const ConversationToolOutputContext = createContext<ConversationToolResultPort | undefined>(undefined);
const noUpdates = () => () => {};
const zero = () => 0;

export function useStreamedToolResult<T extends Pick<ConversationToolCallProps, 'toolCallId' | 'result' | 'isPreliminary'>>(props: T): T {
  const source = useContext(ConversationToolOutputContext);
  const message = useAuiState(state => source ? state.optional.message : undefined);
  useSyncExternalStore(source?.subscribe ?? noUpdates, source?.getRevision ?? zero, source?.getRevision ?? zero);
  if (!source || !message || props.result !== undefined) return props;
  const projected = source.readMessage(message);
  const part = projected.content.find(part => part.type === 'tool-call' && part.toolCallId === props.toolCallId);
  return part?.type === 'tool-call' && part.isPreliminary
    ? { ...props, result: part.result, isPreliminary: true } : props;
}
