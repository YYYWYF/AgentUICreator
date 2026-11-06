import {
  ConversationActionMoreMenu,
  ConversationCanonicalResponseExportMarkdownAction,
} from '@za38.03/agent-ui-plugins';
import type { UIPluginComponentProps } from '@za38.03/agent-ui-plugins/contracts';
import type { ComponentProps } from 'react';

export function ConversationExportMarkdownActionPlugin({
  renderSlot: _renderSlot,
  renderScopedSlot: _renderScopedSlot,
  ...props
}: UIPluginComponentProps & ComponentProps<typeof ConversationCanonicalResponseExportMarkdownAction>) {
  return (
    <ConversationActionMoreMenu>
      <ConversationCanonicalResponseExportMarkdownAction presentation="menu" {...props} />
    </ConversationActionMoreMenu>
  );
}
