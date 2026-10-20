import { ConversationMentionTrigger as Implementation } from "@za38.03/agent-ui-plugins/mention-trigger";
import type { ComponentProps } from "react";
import {usePluginService} from "../../runtime/plugins";
import { CONVERSATION_MENTION_SOURCE, type ConversationMentionSource } from "../../services/composer-triggers";

export function ConversationMentionTrigger(props: ComponentProps<typeof Implementation>) {
  const source=usePluginService<ConversationMentionSource>(CONVERSATION_MENTION_SOURCE);
  return <Implementation source={source} {...props} />;
}
