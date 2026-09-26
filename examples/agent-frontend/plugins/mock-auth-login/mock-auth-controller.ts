import type {
  UIApplicationGateService,
  UIApplicationGateSnapshot,
} from "../../framework/contracts/ui-plugin";
import type {
  AuthSessionService,
  AuthSessionSnapshot,
} from "../../services/auth-session";

/** Demo only: no credentials, persistence, or backend authentication. */
export function createMockAuthController() {
  let gateSnapshot: UIApplicationGateSnapshot = { status: "blocked" };
  let sessionSnapshot: AuthSessionSnapshot = { authenticated: false };
  let disposed = false;
  const gateListeners = new Set<() => void>();
  const sessionListeners = new Set<() => void>();

  function setSession(next: AuthSessionSnapshot) {
    if (disposed || next.authenticated === sessionSnapshot.authenticated) return;
    sessionSnapshot = next;
    gateSnapshot = { status: next.authenticated ? "ready" : "blocked" };
    sessionListeners.forEach((listener) => listener());
    gateListeners.forEach((listener) => listener());
  }

  const gate: UIApplicationGateService = {
    getSnapshot: () => gateSnapshot,
    subscribe: (listener) => {
      gateListeners.add(listener);
      return () => { gateListeners.delete(listener); };
    },
  };
  const session: AuthSessionService = {
    getSnapshot: () => sessionSnapshot,
    subscribe: (listener) => {
      sessionListeners.add(listener);
      return () => { sessionListeners.delete(listener); };
    },
    login: async () => {
      setSession({
        authenticated: true,
        session: { userId: "demo-user", displayName: "Demo User" },
      });
    },
    logout: () => setSession({ authenticated: false }),
  };

  return {
    gate,
    session,
    dispose() {
      disposed = true;
      gateListeners.clear();
      sessionListeners.clear();
    },
  };
}
