import { CanonicalConversationQuote } from '@za38.03/agent-ui-plugins';
import type { UIPluginComponentProps } from '@za38.03/agent-ui-plugins/contracts';
export function ConversationQuotePlugin(props: UIPluginComponentProps) {
  return <CanonicalConversationQuote {...props} />;
}
