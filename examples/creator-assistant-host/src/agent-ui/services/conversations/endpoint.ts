import { conversationConnection } from './data-source';

export interface ResolveConversationDataEndpointOptions {
  configuredEndpoint?: string | undefined;
}

export function resolveConversationDataEndpoint({
  configuredEndpoint,
}: ResolveConversationDataEndpointOptions): string | undefined {
  const configured = (configuredEndpoint ?? conversationConnection.endpoint)?.trim();
  return configured || undefined;
}
