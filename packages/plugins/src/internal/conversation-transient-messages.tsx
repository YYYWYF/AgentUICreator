"use client";

import { createContext, useContext, useLayoutEffect, useSyncExternalStore, type ReactNode } from "react";
import { useAui } from "@assistant-ui/react";
import { type ConversationTransientMessageService, type TransientMessage } from "../conversation-transient-message-service.js";

const Context = createContext<{ service: ConversationTransientMessageService; conversationId: string } | null>(null);
const EMPTY: readonly TransientMessage[] = Object.freeze([]);
const subscribeEmpty = () => () => {};

/** Product composition only; the canonical runtime remains the sole owner of real messages. */
export function ConversationTransientMessageProvider({ service, conversationId, children }: {
  service: ConversationTransientMessageService;
  conversationId: string;
  children: ReactNode;
}) {
  const aui = useAui();
  useLayoutEffect(() => service.bindTarget(() => ({
    conversationId,
    messageIds: aui.thread().getState().messages.map(message => message.id),
  })), [aui, service, conversationId]);
  return <Context.Provider value={{ service, conversationId }}>{children}</Context.Provider>;
}

export function useConversationTransientMessages(): Pick<ConversationTransientMessageService, "addMessage"> {
  const context = useContext(Context);
  if (!context) throw new Error("useConversationTransientMessages requires ConversationRuntimeProvider");
  return context.service;
}

export const useOptionalTransientMessageContext = () => useContext(Context);

export function useOptionalTransientMessageService(): ConversationTransientMessageService | undefined {
  return useContext(Context)?.service;
}

export function useTransientMessages(): readonly TransientMessage[] {
  const context = useContext(Context);
  return useSyncExternalStore(context?.service.subscribe ?? subscribeEmpty,
    () => context?.service.getSnapshot(context.conversationId) ?? EMPTY,
    () => EMPTY);
}

export interface ConversationTransientMessagesRenderScope {
  afterMessageId: string | null;
}

export { ConversationTransientMessages } from "../plugins/transient-assistant-messages/adapters/presentation/transient-assistant-messages.js";
