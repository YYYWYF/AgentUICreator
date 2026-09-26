import { useEffect } from "react";



import { useConversationRuntimeBridge } from "@agent-ui/runtime-conversation";
import type { AppAgentState } from "../../../agent-contract/agent-state";

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
  const conversation = usePluginService<ConversationService>(
    AGENT_UI_CONVERSATION_SERVICE,
  );
  const binding =
    threadBinding as ConversationServiceThreadBinding<AppAgentState>;
  useEffect(() => {
    if (conversation === undefined) return undefined;
    return binding.attachConversationService(conversation);
  }, [binding, conversation]);

  return null;
}
