import { useEffect, useRef } from "react";
import { useConversationNavigation } from "@agent-ui/react";
import { usePluginService } from "../../runtime/plugins";
import { CONVERSATION_COMMAND_SOURCE, type ConversationCommandRegistry } from "../../services/composer-triggers";
import { useAgentUILocale } from "../../agent-ui/i18n/useAgentUILocale";
export function ConversationCommandSourcePlugin() {
  const source = usePluginService<ConversationCommandRegistry>(CONVERSATION_COMMAND_SOURCE);
  const navigation = useConversationNavigation();
  const navigationRef = useRef(navigation); navigationRef.current = navigation;
  const labels = useAgentUILocale("conversationTriggers");
  useEffect(() => source?.register({ id: "new", label: labels.newConversation, mode: "action",
    execute: () => navigationRef.current.switchToNewThread().then(() => undefined),
  }), [source, labels.newConversation]);
  return null;
}
