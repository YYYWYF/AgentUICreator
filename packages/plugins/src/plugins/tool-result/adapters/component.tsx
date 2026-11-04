import {
  ConversationToolResult,
  type ConversationToolResultProps,
  type ToolFallbackPresentationProps,
  type ToolResultContentProps,
} from '@za38.03/agent-ui-plugins';
import type { UIPluginComponentProps } from '../../framework/contracts/ui-plugin';
export function ConversationToolResultPlugin({
  tool,
  renderSlot: _renderSlot,
  renderScopedSlot: _renderScopedSlot,
  ...props
}: UIPluginComponentProps & {
  tool?: ConversationToolResultProps;
  resultOnly?: boolean;
} & ToolFallbackPresentationProps &
  Omit<ToolResultContentProps, 'result'>) {
  return tool ? <ConversationToolResult {...tool} {...props} /> : null;
}
