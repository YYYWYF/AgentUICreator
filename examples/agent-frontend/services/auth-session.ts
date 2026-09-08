export const AUTH_SESSION_SERVICE = "auth.session" as const;

export interface AuthSession {
  userId: string;
  displayName: string;
  email: string;
  loggedInAt: string;
}

export interface AuthSessionSnapshot {
  authenticated: boolean;
  session?: AuthSession;
}

export interface AuthSessionService {
  getSnapshot(): AuthSessionSnapshot;
  subscribe(listener: () => void): () => void;
  login(input?: { email?: string }): void;
  logout(): void;
}

declare module "../framework/contracts/ui-plugin" {
  interface UIPluginServiceMap {
    [AUTH_SESSION_SERVICE]: AuthSessionService;
  }
}
