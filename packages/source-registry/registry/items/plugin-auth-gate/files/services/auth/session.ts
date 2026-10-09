import type { UIApplicationGateService } from "../../framework/contracts/ui-plugin";
export interface AuthUser { id: string; displayName: string; email?: string; avatarUrl?: string; }
export interface AuthCredentials { account: string; password: string; }
export interface AuthSessionSnapshot {
  status: "checking" | "anonymous" | "authenticated";
  user: AuthUser | null;
  busy: boolean;
  error: "sign-in-failed" | "sign-out-failed" | null;
}
export interface AuthAdapter {
  restore(): Promise<AuthUser | null>;
  signIn(input: AuthCredentials): Promise<AuthUser>;
  signOut(): Promise<void>;
  /** Notify expiry/401 with null; profile updates with the current user. */
  subscribe?(listener: (user: AuthUser | null) => void): () => void;
}
export interface AuthSessionService {
  getSnapshot(): AuthSessionSnapshot;
  subscribe(listener: () => void): () => void;
  signIn(input: AuthCredentials): Promise<void>;
  signOut(): Promise<void>;
  restore(): Promise<void>;
  gate: UIApplicationGateService;
  dispose(): void;
}
declare module "../../framework/contracts/ui-plugin" {
  interface UIPluginServiceMap { "auth.session": AuthSessionService; "auth.gate": UIApplicationGateService; }
}
