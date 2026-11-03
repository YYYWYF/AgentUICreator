import { ConversationToolResult, type ConversationToolFallbackRenderScope, type ConversationToolResultProps } from "@za38.03/agent-ui-plugins";
import type { UIPluginComponentProps } from "@za38.03/agent-ui-plugins/contracts";
import { usePluginRenderScope } from "@za38.03/agent-ui-runtime/ui/runtime/plugins/index";
export function ConversationToolResultPlugin(_props: UIPluginComponentProps) {
  const scope = usePluginRenderScope<ConversationToolFallbackRenderScope>();
  return scope?.kind === "conversation.tool-fallback" ? <ConversationToolResult {...scope.value.tool} /> : null;
}
