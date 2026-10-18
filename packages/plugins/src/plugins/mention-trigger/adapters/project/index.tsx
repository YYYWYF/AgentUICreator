import { CanonicalConversationMentionTrigger as Implementation } from "@za38.03/agent-ui-plugins";
import type { ComponentProps } from "react";
import type { UIPluginComponentProps } from "../../framework/contracts/ui-plugin";
import {usePluginService} from "../../runtime/plugins";
import { CONVERSATION_MENTION_SOURCE, type ConversationMentionSource } from "../../services/composer-triggers";

export function ConversationMentionTrigger(props: ComponentProps<typeof Implementation> & Partial<UIPluginComponentProps>) {
  const source=usePluginService<ConversationMentionSource>(CONVERSATION_MENTION_SOURCE);
  return <Implementation source={source} {...props} />;
}
