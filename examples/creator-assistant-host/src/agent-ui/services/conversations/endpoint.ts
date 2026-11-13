import { conversationDataSourceConfig } from './http-data-source';

export interface ResolveConversationDataEndpointOptions {
  configuredEndpoint?: string | undefined;
}

export function resolveConversationDataEndpoint({
  configuredEndpoint,
}: ResolveConversationDataEndpointOptions): string | undefined {
  const configured = (configuredEndpoint ?? conversationDataSourceConfig.endpoint)?.trim();
  return configured || undefined;
}
