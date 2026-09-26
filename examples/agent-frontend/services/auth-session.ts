import type {
  UIApplicationGateService,
  UIPluginObservableService,
} from "../framework/contracts/ui-plugin";

export const AUTH_SESSION_SERVICE = "auth.session" as const;
export const AUTH_GATE_SERVICE = "auth.gate" as const;

export interface AuthSession {
  userId: string;
  displayName: string;
}

export type AuthSessionSnapshot =
  | { authenticated: false }
  | { authenticated: true; session: AuthSession };

/** Replace the demo provider with the internal identity system at this seam. */
export interface AuthSessionService
  extends UIPluginObservableService<AuthSessionSnapshot> {
  login(): Promise<void>;
  logout(): void;
}

declare module "../framework/contracts/ui-plugin" {
  interface UIPluginServiceMap {
    [AUTH_SESSION_SERVICE]: AuthSessionService;
    [AUTH_GATE_SERVICE]: UIApplicationGateService;
  }
}
