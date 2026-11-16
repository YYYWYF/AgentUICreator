export * from '@za38.03/agent-ui-plugins/conversation-service';
export { resolveConversationDataEndpoint, type ResolveConversationDataEndpointOptions } from './conversations/endpoint';
export {
  conversationConnection,
  createConversationDataSource,
  type ConversationDataSourceDependencies,
} from './conversations/data-source';

export const AGENT_UI_CONVERSATION_SERVICE = 'agent-ui.conversations';
export const AGENT_UI_CONVERSATION_DATA_SOURCE_SERVICE = 'agent-ui.conversation-data-source';
