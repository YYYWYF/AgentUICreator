import type { AuthAdapter } from "./session";
/** Host-owned seam. Replace this factory with the application's existing auth
 * client. Keep credentials, cookies and tokens in that client, outside UI state.
 * Throw during restore for unrecoverable initialization; return null for expiry.
 * Protected APIs must independently authorize every request on the backend.
 * Never enable the demo adapter automatically, including in development.
 */
export function createHostAuthAdapter(): AuthAdapter {
  return {
    restore: async () => { throw new Error("AUTH_ADAPTER_NOT_CONFIGURED"); },
    signIn: async () => { throw new Error("AUTH_ADAPTER_NOT_CONFIGURED"); },
    signOut: async () => {},
  };
}
