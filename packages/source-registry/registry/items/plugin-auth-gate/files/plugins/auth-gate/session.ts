import type { UIApplicationGateSnapshot } from "../../framework/contracts/ui-plugin";
import type { AuthAdapter, AuthSessionService, AuthSessionSnapshot, AuthUser } from "../../services/auth/session";

/** A single state source; cached projections are stable until a transition. */
export function createAuthSession(adapter: AuthAdapter): AuthSessionService {
  let snapshot: AuthSessionSnapshot = { status: "checking", user: null, busy: false, error: null };
  let gate: UIApplicationGateSnapshot = { status: "checking" };
  let disposed = false;
  let generation = 0;
  const listeners = new Set<() => void>();
  const publish = (next: AuthSessionSnapshot, failure = false) => {
    if (disposed) return;
    snapshot = next;
    const status = failure ? "error" : next.status === "authenticated" ? "ready" : next.status === "checking" ? "checking" : "blocked";
    if (gate.status !== status) gate = { status, ...(failure ? { message: "AUTH_INITIALIZATION_FAILED" } : {}) };
    listeners.forEach(listener => listener());
  };
  const project = (value: AuthUser): AuthUser => {
    if (!value || typeof value.id !== "string" || !value.id.trim() || typeof value.displayName !== "string") throw new Error("AUTH_INVALID_USER");
    return { id: value.id, displayName: value.displayName, ...(typeof value.email === "string" ? { email: value.email } : {}), ...(typeof value.avatarUrl === "string" ? { avatarUrl: value.avatarUrl } : {}) };
  };
  const setUser = (user: AuthUser | null) => publish({ status: user ? "authenticated" : "anonymous", user: user ? project(user) : null, busy: false, error: null });
  const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
  const unsubscribe = adapter.subscribe?.(user => {
    // Profile updates preserve the same identity; identity changes first revoke
    // readiness synchronously so the old Workspace and caches are disposed.
    ++generation;
    if (snapshot.user && user && snapshot.user.id !== user.id) {
      setUser(null);
      const current = generation;
      queueMicrotask(() => { if (!disposed && current === generation) { try { setUser(user); } catch { setUser(null); } } });
    } else { try { setUser(user); } catch { setUser(null); } }
  });
  return {
    getSnapshot: () => snapshot, subscribe,
    gate: { getSnapshot: () => gate, subscribe },
    async restore() {
      const current = ++generation;
      publish({ status: "checking", user: null, busy: false, error: null });
      try { const user = await adapter.restore(); if (current === generation && !disposed) setUser(user); }
      catch { if (current === generation) publish({ status: "anonymous", user: null, busy: false, error: null }, true); }
    },
    async signIn(input) {
      if (disposed || snapshot.busy) return;
      const current = ++generation;
      publish({ status: "anonymous", user: null, busy: true, error: null });
      try { const user = await adapter.signIn(input); if (current === generation && !disposed) setUser(user); }
      catch { if (current === generation) publish({ status: "anonymous", user: null, busy: false, error: "sign-in-failed" }); }
    },
    async signOut() {
      if (disposed) return;
      const current = ++generation;
      // Revoke locally before awaiting the network, even if remote logout fails.
      publish({ status: "anonymous", user: null, busy: true, error: null });
      try { await adapter.signOut(); if (current === generation) setUser(null); }
      catch { if (current === generation) publish({ status: "anonymous", user: null, busy: false, error: "sign-out-failed" }); }
    },
    dispose() { disposed = true; ++generation; unsubscribe?.(); listeners.clear(); snapshot = { status: "anonymous", user: null, busy: false, error: null }; gate = { status: "blocked" }; },
  };
}
