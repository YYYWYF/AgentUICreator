"use client";

import { createContext, useCallback, useContext, useLayoutEffect, type ReactNode } from "react";
import { useAui } from "@assistant-ui/react";
import { useAgentUILocale } from "../locale.js";
import { useOptionalTransientMessageContext } from "./conversation-transient-messages.js";
import { useThreadRootElementRef } from "./quote-thread-root.js";

// Runtime supplies policy state; presentation never inspects AG-UI metadata.
const ComposerGuardContext = createContext({ awaitingReply: false, interruptKey: "" });
// Policy state follows the page-owned service across Composer remounts and thread switches.
const reminders = new WeakMap<object, Map<string, { interruptKey: string; messageId: string }>>();

export function ConversationComposerGuardProvider({ awaitingReply, interruptKey = "pending", children }: {
  awaitingReply: boolean;
  interruptKey?: string | undefined;
  children: ReactNode;
}) {
  const context = useOptionalTransientMessageContext();
  useLayoutEffect(() => {
    if (context && !awaitingReply) reminders.get(context.service)?.delete(context.conversationId);
  }, [context?.service, context?.conversationId, awaitingReply]);
  return <ComposerGuardContext.Provider value={{ awaitingReply, interruptKey }}>{children}</ComposerGuardContext.Provider>;
}

export const useConversationComposerAwaitingReply = () => useContext(ComposerGuardContext).awaitingReply;

/** Returns true when the attempted send was handled locally; never clears the draft. */
export function useConversationComposerSendGuard() {
  const { awaitingReply, interruptKey } = useContext(ComposerGuardContext);
  const context = useOptionalTransientMessageContext();
  const messages = useAgentUILocale("composer");
  const aui = useAui();
  const rootRef = useThreadRootElementRef();
  return useCallback(() => {
    if (!awaitingReply) return false;
    if (aui.composer.getState().canSend) {
      let messageId: string | undefined;
      if (context) {
        const { service, conversationId } = context;
        let byConversation = reminders.get(service);
        if (!byConversation) reminders.set(service, byConversation = new Map());
        const existing = byConversation.get(conversationId);
        if (existing?.interruptKey === interruptKey) messageId = existing.messageId;
        else {
          messageId = service.addMessage({ role: "system", text: messages.awaitingReply });
          byConversation.set(conversationId, { interruptKey, messageId });
        }
      }
      // A blocked send has no run-start event to reveal the new bubble.
      const viewport = rootRef?.current?.querySelector<HTMLElement>('[data-slot="aui_thread-viewport"]');
      if (viewport) requestAnimationFrame(() => {
        if (!viewport.isConnected) return;
        const reminder = Array.from(viewport.querySelectorAll<HTMLElement>('[data-slot="transient-message"]'))
          .find(element => element.dataset.transientMessageId === messageId);
        if (reminder) {
          const bounds = reminder.getBoundingClientRect();
          const visible = viewport.getBoundingClientRect();
          if (bounds.top < visible.top) viewport.scrollTo({ top: viewport.scrollTop + bounds.top - visible.top, behavior: "instant" });
          else if (bounds.bottom > visible.bottom) viewport.scrollTo({ top: viewport.scrollTop + bounds.bottom - visible.bottom, behavior: "instant" });
        } else viewport.scrollTo({ top: viewport.scrollHeight, behavior: "instant" });
      });
    }
    return true;
  }, [awaitingReply, interruptKey, context, messages.awaitingReply, aui, rootRef]);
}
