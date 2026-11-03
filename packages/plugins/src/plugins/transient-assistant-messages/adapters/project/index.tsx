import { ConversationTransientMessages, type ConversationTransientMessagesRenderScope } from "@za38.03/agent-ui-plugins";
import { usePluginRenderScope } from "@za38.03/agent-ui-runtime/ui/runtime/plugins/index";
export function TransientAssistantMessagesPlugin() {
  const scope = usePluginRenderScope<ConversationTransientMessagesRenderScope>();
  return scope?.kind === "conversation.transient-messages" ? <ConversationTransientMessages {...scope.value} /> : null;
}
