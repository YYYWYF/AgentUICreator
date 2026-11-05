export interface ResolveConversationDataEndpointOptions {
  configuredEndpoint?: string | undefined;
}

/**
 * Project-owned fixed base URL of the business conversation history API.
 *
 * Fill in your history service base, for example 'https://history.example.com/api'.
 * List, detail, delete, rename, archive and unarchive paths stay in
 * `./http-data-source.ts` (`conversationRequests`).
 * Requests send no business credentials: `credentials` stays 'same-origin', so a
 * cross-origin history service receives no cookies.
 *
 * While this stays empty and no preview override is provided, history falls back to
 * the empty data source and the conversation list remains empty.
 */
export const CONVERSATION_HISTORY_ENDPOINT = '';

export function resolveConversationDataEndpoint({
  configuredEndpoint,
}: ResolveConversationDataEndpointOptions): string | undefined {
  // A preview override still wins so a test service can be targeted temporarily.
  const configured = configuredEndpoint?.trim() || CONVERSATION_HISTORY_ENDPOINT.trim();
  return configured || undefined;
}
