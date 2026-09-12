import { useAui } from "@assistant-ui/react";
import { useEffect } from "react";

import type { AppAgentState } from "../../../../agent-contract/agent-state";
import { useAssistantUiRuntimeBridge } from "@agent-ui/runtime-assistant-ui";
import {
  usePluginService,
} from "../../../../runtime/plugins";
import {
  AGENT_UI_CONVERSATION_SERVICE,
  type AgentUIConversationService,
} from "../../../../services/conversations";
import type { ConversationServiceAssistantUiThreadBinding } from "./conversation-service-thread-binding";

/** Connects the example's Conversation Service to the assistant-ui Runtime. */
export function AssistantUiConversationThreadBindingConnector() {
  const aui = useAui();
  const { threadBinding } = useAssistantUiRuntimeBridge<AppAgentState>();
  const conversation = usePluginService<AgentUIConversationService>(
    AGENT_UI_CONVERSATION_SERVICE,
  );
  const binding =
    threadBinding as ConversationServiceAssistantUiThreadBinding<AppAgentState>;

  useEffect(() => {
    if (conversation === undefined) return undefined;
    return binding.attachConversationService(conversation);
  }, [binding, conversation]);

  useEffect(() => {
    const capture = () => {
      const state = aui.thread.getState();
      binding.captureLiveThread({
        messages: state.messages,
        ...(state.state === undefined
          ? {}
          : { state: state.state as AppAgentState }),
      });
    };

    capture();
    return aui.subscribe(capture);
  }, [aui, binding]);

  return null;
}
