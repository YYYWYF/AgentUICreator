import { ConversationComposerMentionTrigger } from "@agent-ui/react";
import { usePluginService } from "../../runtime/plugins";
import { CONVERSATION_MENTION_SOURCE, type ConversationMentionSource } from "../../services/composer-triggers";
import { useAgentUILocale } from "../../agent-ui/i18n/useAgentUILocale";
export function AssistantUiMentionTrigger() {
  const source = usePluginService<ConversationMentionSource>(CONVERSATION_MENTION_SOURCE);
  const labels = useAgentUILocale("conversationTriggers");
  return <ConversationComposerMentionTrigger source={source} labels={labels} />;
}
