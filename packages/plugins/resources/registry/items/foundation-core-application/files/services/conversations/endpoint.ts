export interface ResolveConversationDataEndpointOptions {
  configuredEndpoint?: string | undefined;
}

export function resolveConversationDataEndpoint({
  configuredEndpoint,
}: ResolveConversationDataEndpointOptions): string | undefined {
  const configured = configuredEndpoint?.trim();
  return configured || undefined;
}
