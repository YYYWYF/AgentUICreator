import {
  ConversationActionMoreMenu,
  ConversationCanonicalResponseExportMarkdownAction,
  type ResponseExportMarkdownActionProps,
} from '@za38.03/agent-ui-plugins';
import type { UIPluginComponentProps } from '@za38.03/agent-ui-plugins/contracts';
export type ConversationExportMarkdownActionPluginProps =
  | (Omit<Extract<ResponseExportMarkdownActionProps, { presentation: 'menu' }>, 'presentation'> & {
      presentation?: 'menu';
    })
  | (Extract<ResponseExportMarkdownActionProps, { presentation?: 'button' }> & { presentation: 'button' });
export function ConversationExportMarkdownActionPlugin({
  renderSlot: _renderSlot,
  renderScopedSlot: _renderScopedSlot,
  ...props
}: UIPluginComponentProps & ConversationExportMarkdownActionPluginProps) {
  if (props.presentation === 'button') return <ConversationCanonicalResponseExportMarkdownAction {...props} />;
  const { presentation: _presentation, ...menuProps } = props;
  return (
    <ConversationActionMoreMenu>
      <ConversationCanonicalResponseExportMarkdownAction {...menuProps} presentation='menu' />
    </ConversationActionMoreMenu>
  );
}
