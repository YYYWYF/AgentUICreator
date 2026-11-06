import { ConversationCanonicalResponseFeedbackActions } from '@za38.03/agent-ui-plugins';
import type { UIPluginComponentProps } from '@za38.03/agent-ui-plugins/contracts';
import type { ComponentProps } from 'react';

export function ConversationFeedbackActionsPlugin({
  renderSlot: _renderSlot,
  renderScopedSlot: _renderScopedSlot,
  ...props
}: UIPluginComponentProps & Partial<ComponentProps<typeof ConversationCanonicalResponseFeedbackActions>>) {
  return <ConversationCanonicalResponseFeedbackActions {...props} />;
}
