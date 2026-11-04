import { ConversationToolTimeline, type ConversationToolTimelineRenderScope } from '@za38.03/agent-ui-plugins';
import type { UIPluginComponentProps } from '@za38.03/agent-ui-plugins/contracts';
import { usePluginRenderScope } from '@za38.03/agent-ui-runtime/ui/runtime/plugins/index';
import type { ComponentProps } from 'react';
export function ConversationToolTimelinePlugin({
  renderSlot: _renderSlot,
  renderScopedSlot: _renderScopedSlot,
  ...props
}: UIPluginComponentProps & Partial<ComponentProps<typeof ConversationToolTimeline>>) {
  const scope = usePluginRenderScope<ConversationToolTimelineRenderScope>();
  if (scope?.kind !== 'conversation.tool-timeline') {
    return null;
  }
  return <ConversationToolTimeline {...scope.value} {...props} />;
}
