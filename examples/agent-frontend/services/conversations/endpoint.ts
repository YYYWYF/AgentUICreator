export interface ResolveConversationDataEndpointOptions {
  configuredEndpoint?: string | undefined;
  dataMode?: string | undefined;
  isDev: boolean;
}

export function resolveConversationDataEndpoint({
  configuredEndpoint,
  dataMode,
  isDev,
}: ResolveConversationDataEndpointOptions): string | undefined {
  const configured = configuredEndpoint?.trim();
  if (configured) return configured;
  return isDev && dataMode?.trim() === "mock"
    ? "/__agent-ui/mock-data"
    : undefined;
}
