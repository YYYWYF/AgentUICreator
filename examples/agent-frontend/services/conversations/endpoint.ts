export interface ResolveConversationDataEndpointOptions {
  configuredEndpoint?: string | undefined;
  isDev: boolean;
}

export function resolveConversationDataEndpoint({
  configuredEndpoint,
  isDev,
}: ResolveConversationDataEndpointOptions): string | undefined {
  const configured = configuredEndpoint?.trim();
  if (configured) return configured;
  return isDev ? "/__agent-ui/mock-data" : undefined;
}
