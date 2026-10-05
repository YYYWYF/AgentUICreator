import { ConversationComposerCommandTrigger } from "@agent-ui/react";
import { usePluginService } from "../../runtime/plugins";
import { CONVERSATION_COMMAND_SOURCE, type ConversationCommandRegistry } from "../../services/composer-triggers";
import { useAgentUILocale } from "../../agent-ui/i18n/useAgentUILocale";
export function AssistantUiSlashCommandTrigger() {
  const source = usePluginService<ConversationCommandRegistry>(CONVERSATION_COMMAND_SOURCE);
  const labels = useAgentUILocale("conversationTriggers");
  return <ConversationComposerCommandTrigger source={source} labels={labels} />;
}
