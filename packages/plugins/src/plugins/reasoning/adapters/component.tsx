import {
  ConversationCanonicalReasoningGroup,
  type ConversationCanonicalReasoningGroupProps,
} from '@za38.03/agent-ui-plugins';
import type { UIPluginComponentProps } from '../../framework/contracts/ui-plugin';
export function ConversationReasoningPlugin({
  group,
  renderSlot: _renderSlot,
  renderScopedSlot: _renderScopedSlot,
  ...props
}: UIPluginComponentProps & Partial<ConversationCanonicalReasoningGroupProps>) {
  if (!group) {
    return null;
  }
  return <ConversationCanonicalReasoningGroup {...props} group={group} />;
}
