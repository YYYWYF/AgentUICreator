import { CanonicalConversationDataSourcePlugin as Implementation } from '@za38.03/agent-ui-plugins';
import type { UIPluginComponentProps } from '@za38.03/agent-ui-plugins/contracts';
import type { ComponentProps } from 'react';
export function ConversationDataSourcePlugin(
  props: ComponentProps<typeof Implementation> & Partial<UIPluginComponentProps>,
) {
  return <Implementation {...props} />;
}

export {
  createHttpConversationDataSource,
  type HttpConversationDataSourceOptions,
  type HttpConversationDataSourceRoutes,
} from '@za38.03/agent-ui-plugins/conversation-data-source';
