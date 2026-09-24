import {
  ConversationToolFallback,
  type ConversationToolFallbackRenderScope,
} from "@agent-ui/react";
import type { UIPluginComponentProps } from "../../framework/contracts/ui-plugin";
import { usePluginRenderScope } from "../../runtime/plugins";

export function AssistantUiToolFallbackPlugin(_props: UIPluginComponentProps) {
  const scope = usePluginRenderScope<ConversationToolFallbackRenderScope>();
  if (scope?.kind !== "conversation.tool-fallback") return null;
  return <ConversationToolFallback {...scope.value.tool} />;
}
