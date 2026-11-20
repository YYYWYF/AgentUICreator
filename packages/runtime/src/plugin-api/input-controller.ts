import type { RunAgentInput } from '@ag-ui/client';
import type { ComponentType, ReactNode } from 'react';
import { createContext, useContext, type RefObject } from 'react';

/** Shared identity only. The application owns and validates the opaque port. */
export const ConversationInputContext = createContext<{
  readonly runtime: unknown;
  readonly threadId: string;
} | null>(null);

/** Scoped conversation DOM boundary for application-owned presentation. */
export const ConversationSurfaceElementContext = createContext<RefObject<HTMLDivElement | null> | null>(null);
export const useConversationSurfaceElement = () => useContext(ConversationSurfaceElementContext);

/** Application-supplied input behavior. Runtime never interprets its data. */
export interface ConversationInputController {
  /** Let the selected implementation bind its metadata before native history enrichment. */
  onHistoryLoaded?(threadId: string, messages: readonly unknown[]): void;
  readonly Provider?: ComponentType<{ threadId: string; children: ReactNode }>;
  /** Native session supplied opaquely; the input implementation validates it. */
  attach(threadId: string, runtime: unknown): () => void;
  transformRequest(input: RunAgentInput, context: ConversationInputRequestContext): RunAgentInput;
}

export interface ConversationInputRequestContext {
  readonly threadId: string;
  readonly runtime: unknown;
  /** Includes submissions not yet published in the native React projection. */
  readonly submittedMessages: readonly unknown[];
}

export type ConversationInputControllerFactory = () => ConversationInputController;
