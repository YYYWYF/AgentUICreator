import { ConversationSlashCommandTrigger as Implementation } from "@za38.03/agent-ui-plugins/slash-command-trigger";
import type { ComponentProps } from "react";
import {usePluginService} from "../../runtime/plugins";
import { CONVERSATION_COMMAND_SOURCE, type ConversationCommandRegistry } from "../../services/composer-triggers";

export function ConversationSlashCommandTrigger(props: ComponentProps<typeof Implementation>) {
  const source=usePluginService<ConversationCommandRegistry>(CONVERSATION_COMMAND_SOURCE);
  return <Implementation source={source} {...props} />;
}
