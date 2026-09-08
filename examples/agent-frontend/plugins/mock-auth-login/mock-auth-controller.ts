import type {
  UIApplicationGateService,
  UIApplicationGateSnapshot,
} from "../../framework/contracts/ui-plugin";
import type {
  AuthSession,
  AuthSessionService,
  AuthSessionSnapshot,
} from "../../services/auth-session";

export const MOCK_AUTH_STORAGE_KEY = "agent-ui.mock-auth-session";

export interface MockAuthStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface MockAuthController {
  gate: UIApplicationGateService;
  session: AuthSessionService;
  initialize(): void;
  dispose(): void;
}

const CHECKING_GATE_SNAPSHOT: UIApplicationGateSnapshot = {
  status: "checking",
};
const BLOCKED_GATE_SNAPSHOT: UIApplicationGateSnapshot = {
  status: "blocked",
};
const READY_GATE_SNAPSHOT: UIApplicationGateSnapshot = {
  status: "ready",
};
const ANONYMOUS_SESSION_SNAPSHOT: AuthSessionSnapshot = {
  authenticated: false,
};

function isNonBlankString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isValidMockSession(value: unknown): value is AuthSession {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Partial<AuthSession>;
  return (
    isNonBlankString(candidate.userId) &&
    isNonBlankString(candidate.displayName) &&
    isNonBlankString(candidate.email) &&
    isNonBlankString(candidate.loggedInAt) &&
    Number.isNaN(Date.parse(candidate.loggedInAt)) === false
  );
}

function notify(listeners: ReadonlySet<() => void>): void {
  listeners.forEach((listener) => listener());
}

export function createMockAuthController(
  storage: MockAuthStorage = localStorage,
): MockAuthController {
  let gateSnapshot = CHECKING_GATE_SNAPSHOT;
  let sessionSnapshot = ANONYMOUS_SESSION_SNAPSHOT;
  let disposed = false;
  const gateListeners = new Set<() => void>();
  const sessionListeners = new Set<() => void>();

  function updateGate(nextSnapshot: UIApplicationGateSnapshot): void {
    if (gateSnapshot.status === nextSnapshot.status) {
      return;
    }

    gateSnapshot = nextSnapshot;
    notify(gateListeners);
  }

  function updateSession(nextSnapshot: AuthSessionSnapshot): void {
    if (
      sessionSnapshot.authenticated === nextSnapshot.authenticated &&
      sessionSnapshot.session === nextSnapshot.session
    ) {
      return;
    }

    sessionSnapshot = nextSnapshot;
    notify(sessionListeners);
  }

  function setAnonymous(): void {
    updateSession(ANONYMOUS_SESSION_SNAPSHOT);
    updateGate(BLOCKED_GATE_SNAPSHOT);
  }

  function setAuthenticated(session: AuthSession): void {
    updateSession({ authenticated: true, session });
    updateGate(READY_GATE_SNAPSHOT);
  }

  const gate: UIApplicationGateService = {
    getSnapshot: () => gateSnapshot,
    subscribe: (listener) => {
      gateListeners.add(listener);
      return () => gateListeners.delete(listener);
    },
  };

  const session: AuthSessionService = {
    getSnapshot: () => sessionSnapshot,
    subscribe: (listener) => {
      sessionListeners.add(listener);
      return () => sessionListeners.delete(listener);
    },
    login: (input) => {
      if (disposed) {
        return;
      }

      const nextSession: AuthSession = {
        userId: "demo-user",
        displayName: "Demo User",
        email: input?.email?.trim() || "demo@example.com",
        loggedInAt: new Date().toISOString(),
      };
      storage.setItem(MOCK_AUTH_STORAGE_KEY, JSON.stringify(nextSession));
      setAuthenticated(nextSession);
    },
    logout: () => {
      if (disposed) {
        return;
      }

      storage.removeItem(MOCK_AUTH_STORAGE_KEY);
      setAnonymous();
    },
  };

  return {
    gate,
    session,
    initialize: () => {
      if (disposed) {
        return;
      }

      let raw: string | null;
      try {
        raw = storage.getItem(MOCK_AUTH_STORAGE_KEY);
      } catch {
        setAnonymous();
        return;
      }

      if (raw === null) {
        setAnonymous();
        return;
      }

      try {
        const parsed: unknown = JSON.parse(raw);
        if (!isValidMockSession(parsed)) {
          throw new Error("Invalid mock session");
        }
        setAuthenticated(parsed);
      } catch {
        storage.removeItem(MOCK_AUTH_STORAGE_KEY);
        setAnonymous();
      }
    },
    dispose: () => {
      disposed = true;
      gateListeners.clear();
      sessionListeners.clear();
    },
  };
}
