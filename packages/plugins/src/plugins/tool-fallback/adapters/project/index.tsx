import {
  ConversationToolFallback,
  type ConversationToolFallbackRenderScope,
} from "@za38.03/agent-ui-plugins";
import type { UIPluginComponentProps } from "@za38.03/agent-ui-plugins/contracts";
import { usePluginRenderScope } from "@za38.03/agent-ui-runtime/ui/runtime/plugins/index";

export function ConversationToolFallbackPlugin(_props: UIPluginComponentProps) {
  const scope = usePluginRenderScope<ConversationToolFallbackRenderScope>();
  if (scope?.kind !== "conversation.tool-fallback") return null;
  return <ConversationToolFallback {...scope.value.tool} />;
}
