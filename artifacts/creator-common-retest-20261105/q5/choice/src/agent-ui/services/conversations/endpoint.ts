export interface ResolveConversationDataEndpointOptions {
  configuredEndpoint?: string | undefined;
}

/**
 * Project-owned fixed base URL of the business conversation history API.
 *
 * This is the business history service the assistant reads and manages
 * conversations from. It is unrelated to the Agent (AG-UI) endpoint, which only
 * serves live runs.
 *
 * List, detail, delete, rename, archive and unarchive paths stay in
 * `./http-data-source.ts` (`conversationRequests`).
 * Requests send no business credentials: `credentials` stays 'same-origin', so a
 * cross-origin history service receives no cookies.
 *
 * Emptying this while no preview override is provided falls history back to the
 * empty data source and the conversation list becomes empty again.
 */
export const CONVERSATION_HISTORY_ENDPOINT = 'http://127.0.0.1:47835';

export function resolveConversationDataEndpoint({
  configuredEndpoint,
}: ResolveConversationDataEndpointOptions): string | undefined {
  // A preview override still wins so a test service can be targeted temporarily.
  const configured = configuredEndpoint?.trim() || CONVERSATION_HISTORY_ENDPOINT.trim();
  return configured || undefined;
}
