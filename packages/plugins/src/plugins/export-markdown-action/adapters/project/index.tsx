import {
  ConversationActionMoreMenu,
  ConversationCanonicalResponseExportMarkdownAction,
  useAgentUILocale,
} from '@za38.03/agent-ui-plugins';
import type { UIPluginComponentProps } from '@za38.03/agent-ui-plugins/contracts';
import type { ComponentProps } from 'react';

export function ConversationExportMarkdownActionPlugin({
  renderSlot: _renderSlot,
  renderScopedSlot: _renderScopedSlot,
  ...props
}: UIPluginComponentProps & ComponentProps<typeof ConversationCanonicalResponseExportMarkdownAction>) {
  const labels = useAgentUILocale('conversation');
  return (
    <ConversationActionMoreMenu label={labels.moreActions}>
      <ConversationCanonicalResponseExportMarkdownAction menuLabel={labels.exportMarkdown} {...props} />
    </ConversationActionMoreMenu>
  );
}
