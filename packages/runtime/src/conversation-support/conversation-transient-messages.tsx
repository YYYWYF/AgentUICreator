"use client";

import {
  createContext,
  useContext,
  useLayoutEffect,
  useMemo,
  type ReactNode,
} from "react";
import { useStoreValue } from "../observation/use-store-value.js";
import { useAui } from "@assistant-ui/react";
import {
  type ConversationTransientMessageService,
  type TransientMessage,
} from "./conversation-transient-message-service.js";

const Context = createContext<{
  service: ConversationTransientMessageService;
  conversationId: string;
} | null>(null);
const EMPTY: readonly TransientMessage[] = Object.freeze([]);

/** Product composition only; the canonical runtime remains the sole owner of real messages. */
export function ConversationTransientMessageProvider({
  service,
  conversationId,
  children,
}: {
  service: ConversationTransientMessageService;
  conversationId: string;
  children: ReactNode;
}) {
  const aui = useAui();
  useLayoutEffect(
    () =>
      service.bindTarget(() => ({
        conversationId,
        messageIds: aui
          .thread()
          .getState()
          .messages.map((message) => message.id),
      })),
    [aui, service, conversationId],
  );
  const context = useMemo(() => ({ service, conversationId }), [service, conversationId]);
  return (
    <Context.Provider value={context}>
      {children}
    </Context.Provider>
  );
}

export interface ConversationTransientMessagesController {
  getSnapshot(): readonly TransientMessage[];
  subscribe(listener: () => void): () => void;
  addMessage: ConversationTransientMessageService['addMessage'];
}
export function useTransientMessages(): ConversationTransientMessagesController;
export function useTransientMessages<T>(selector: (messages: readonly TransientMessage[]) => T): T;
export function useTransientMessages<T>(selector: ((snapshot: readonly TransientMessage[]) => T) | undefined): ConversationTransientMessagesController | T;
export function useTransientMessages<T>(selector?: (messages: readonly TransientMessage[]) => T): ConversationTransientMessagesController | T {
  const context = useContext(Context);
  const controller = useMemo<ConversationTransientMessagesController>(() => ({
    getSnapshot: () => context?.service.getSnapshot(context.conversationId) ?? EMPTY,
    subscribe: listener => context?.service.subscribe(listener) ?? (() => {}),
    addMessage: input => {
      if (!context) throw new Error('CONVERSATION_TRANSIENT_CONTEXT_REQUIRED');
      return context.service.addMessage(input);
    },
  }), [context]);
  const read = () => {
    if (selector !== undefined) return selector(controller.getSnapshot());
    if (!context) throw new Error('CONVERSATION_TRANSIENT_CONTEXT_REQUIRED');
    return controller;
  };
  return useStoreValue(controller.subscribe, read, selector !== undefined);
}

export const useOptionalTransientMessageContext = () => useContext(Context);

export function useOptionalTransientMessageService():
  | ConversationTransientMessageService
  | undefined {
  return useContext(Context)?.service;
}

export interface ConversationTransientMessagesRenderScope {
  afterMessageId: string | null;
}
