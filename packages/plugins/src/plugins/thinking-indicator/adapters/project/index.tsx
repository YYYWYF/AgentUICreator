import {
  ConversationThinkingIndicator,
  type ConversationThinkingIndicatorRenderScope,
} from '@za38.03/agent-ui-plugins';
import type { UIPluginComponentProps } from '@za38.03/agent-ui-plugins/contracts';
import { usePluginRenderScope } from '@za38.03/agent-ui-runtime/ui/runtime/plugins/index';
import type { ComponentProps } from 'react';
export function ConversationThinkingIndicatorPlugin({
  renderSlot: _renderSlot,
  renderScopedSlot: _renderScopedSlot,
  ...props
}: UIPluginComponentProps & Partial<ComponentProps<typeof ConversationThinkingIndicator>>) {
  const scope = usePluginRenderScope<ConversationThinkingIndicatorRenderScope>();
  if (scope?.kind !== 'conversation.thinking-indicator') {
    return null;
  }
  return <ConversationThinkingIndicator {...scope.value} {...props} />;
}
