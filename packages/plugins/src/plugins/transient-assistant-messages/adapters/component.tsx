import type { UIPluginComponentProps } from "../../framework/contracts/ui-plugin";
import { ConversationTransientMessages, type ConversationTransientMessagesProps } from "@za38.03/agent-ui-plugins";
export function TransientAssistantMessagesPlugin({ afterMessageId = null, renderSlot: _renderSlot, renderScopedSlot: _renderScopedSlot, ...props }: UIPluginComponentProps & Partial<ConversationTransientMessagesProps>) {
  return <ConversationTransientMessages afterMessageId={afterMessageId} {...props} />;
}
