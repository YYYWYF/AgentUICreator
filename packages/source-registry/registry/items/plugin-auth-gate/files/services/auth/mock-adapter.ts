import type { AuthAdapter, AuthUser } from "./session";
/** Explicit demo only. Stores display data, never a token/password. Pass a
 * distinct storage key per Host instance, or omit storage for isolated memory.
 * Demo credentials: any nonempty account and password "demo".
 */
export function createDemoAuthAdapter(options: { demo: true; storage?: Pick<Storage, "getItem" | "setItem" | "removeItem">; storageKey?: string; failRestore?: boolean }): AuthAdapter & { updateUser(user: AuthUser | null): void } {
  if (options.demo !== true) throw new Error("AUTH_DEMO_REQUIRES_EXPLICIT_OPT_IN");
  if (options.storage && !options.storageKey) throw new Error("AUTH_DEMO_STORAGE_KEY_REQUIRED");
  const key = options.storageKey ?? "";
  let user: AuthUser | null = null;
  const listeners = new Set<(user: AuthUser | null) => void>();
  const updateUser = (value: AuthUser | null) => {
    user = value ? { id: value.id, displayName: value.displayName,
      ...(typeof value.email === "string" ? { email: value.email } : {}),
      ...(typeof value.avatarUrl === "string" ? { avatarUrl: value.avatarUrl } : {}) } : null;
    if (options.storage) { if (user) options.storage.setItem(key, JSON.stringify(user)); else options.storage.removeItem(key); }
    listeners.forEach(listener => listener(user));
  };
  return {
    async restore() {
      if (options.failRestore) throw new Error("AUTH_DEMO_RESTORE_FAILED");
      const stored = options.storage?.getItem(key);
      if (stored) {
        const value = JSON.parse(stored);
        if (typeof value.id !== "string" || typeof value.displayName !== "string") throw new Error("AUTH_DEMO_INVALID_PROFILE");
        user = { id: value.id, displayName: value.displayName, ...(typeof value.email === "string" ? { email: value.email } : {}), ...(typeof value.avatarUrl === "string" ? { avatarUrl: value.avatarUrl } : {}) };
      }
      return user;
    },
    async signIn(input) {
      if (!input.account.trim() || input.password !== "demo") throw new Error("AUTH_DEMO_SIGN_IN_FAILED");
      const value = { id: input.account.trim(), displayName: input.account.trim() };
      updateUser(value); return value;
    },
    async signOut() { updateUser(null); },
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    updateUser,
  };
}
