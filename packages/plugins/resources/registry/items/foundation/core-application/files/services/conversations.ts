export * from "@za38.03/agent-ui-runtime/ui/services/conversations";
export { createHttpConversationDataSource, type HttpConversationDataSourceOptions } from "./conversations/http-data-source";
export { resolveConversationDataEndpoint, type ResolveConversationDataEndpointOptions } from "./conversations/endpoint";

export const AGENT_UI_CONVERSATION_SERVICE = "agent-ui.conversations";
export const AGENT_UI_CONVERSATION_DATA_SOURCE_SERVICE = "agent-ui.conversation-data-source";
