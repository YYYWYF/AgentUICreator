import type { UIPluginComponentProps } from '@za38.03/agent-ui-plugins/contracts';
import { CanonicalConversationLexicalEditComposer as Implementation } from '@za38.03/agent-ui-plugins/lexical';
import type { ComponentProps } from 'react';
export function ConversationLexicalEditComposer(
  props: ComponentProps<typeof Implementation> & Partial<UIPluginComponentProps>,
) {
  return <Implementation {...props} />;
}
