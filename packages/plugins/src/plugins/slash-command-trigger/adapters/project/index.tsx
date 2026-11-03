import { CanonicalConversationSlashCommandTrigger as Implementation } from "@za38.03/agent-ui-plugins";
import type { ComponentProps } from "react";
import type { UIPluginComponentProps } from "@za38.03/agent-ui-plugins/contracts";
import {usePluginService} from "@za38.03/agent-ui-runtime/ui/runtime/plugins/index";
import { CONVERSATION_COMMAND_SOURCE, type ConversationCommandRegistry } from "../../services/composer-triggers";

export function ConversationSlashCommandTrigger(props: ComponentProps<typeof Implementation> & Partial<UIPluginComponentProps>) {
  const source=usePluginService<ConversationCommandRegistry>(CONVERSATION_COMMAND_SOURCE);
  return <Implementation source={source} {...props} />;
}
