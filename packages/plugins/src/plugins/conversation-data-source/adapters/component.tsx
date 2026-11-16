import {
  CanonicalConversationDataSourcePlugin,
  type ConversationDataSourcePluginProps,
} from '@za38.03/agent-ui-plugins';
export function ConversationDataSourcePlugin(props: ConversationDataSourcePluginProps) {
  return <CanonicalConversationDataSourcePlugin {...props} />;
}

export {
  createHttpConversationDataSource,
  type HttpConversationDataSourceOptions,
  type HttpConversationRequestOptions,
  type HttpConversationRequestContext,
  type HttpConversationRequestBody,
} from './adapters/http-data-source';
