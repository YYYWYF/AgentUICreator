import {
  ConversationToolFallback,
  type ConversationToolFallbackProps,
  type ToolFallbackPresentationProps,
} from '@za38.03/agent-ui-plugins';
import type { UIPluginComponentProps } from '../../framework/contracts/ui-plugin';
export function ConversationToolFallbackPlugin({
  tool,
  renderSlot: _renderSlot,
  renderScopedSlot: _renderScopedSlot,
  ...props
}: UIPluginComponentProps & { tool?: ConversationToolFallbackProps } & ToolFallbackPresentationProps) {
  return tool ? <ConversationToolFallback {...tool} {...props} /> : null;
}
