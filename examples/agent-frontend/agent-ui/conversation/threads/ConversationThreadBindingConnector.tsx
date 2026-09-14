import { useEffect } from "react";

import { useConversationThread } from "@agent-ui/react";

import { useConversationRuntimeBridge } from "@agent-ui/runtime-conversation";
import type { AppAgentState } from "../../../agent-contract/agent-state";
import { useAgentRun } from "../../../runtime/context";
import {
  usePluginService,
} from "../../../runtime/plugins";
import {
  AGENT_UI_CONVERSATION_SERVICE,
  type ConversationService,
} from "../../../services/conversations";
import type { ConversationServiceThreadBinding } from "./conversation-service-thread-binding";

/** Connects the example's Conversation Service to the conversation runtime. */
export function ConversationThreadBindingConnector() {
  const { threadBinding } = useConversationRuntimeBridge<AppAgentState>();
  const thread = useConversationThread();
  const run = useAgentRun();
  const conversation = usePluginService<ConversationService>(
    AGENT_UI_CONVERSATION_SERVICE,
  );
  const binding =
    threadBinding as ConversationServiceThreadBinding<AppAgentState>;
  const navigationLocked =
    run.status === "running" || run.status === "awaiting-input";

  useEffect(() => {
    binding.setNavigationLocked(navigationLocked);

    return () => {
      binding.setNavigationLocked(false);
    };
  }, [binding, navigationLocked]);

  useEffect(() => {
    if (conversation === undefined) return undefined;
    return binding.attachConversationService(conversation);
  }, [binding, conversation]);

  useEffect(() => {
    const capture = () => {
      const state = thread.getSnapshot();
      binding.captureLiveThread({
        messages: state.messages,
        ...(state.state === undefined
          ? {}
          : { state: state.state as AppAgentState }),
      });
    };

    capture();
    return thread.subscribe(capture);
  }, [binding, thread]);

  return null;
}
