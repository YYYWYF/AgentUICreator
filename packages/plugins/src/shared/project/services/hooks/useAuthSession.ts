import { usePluginService } from '@za38.03/agent-ui-plugins';
import { useMemo } from 'react';
import { AUTH_SESSION_SERVICE, type AuthSessionService, type AuthSessionSnapshot } from '../auth/session';

const fallback: AuthSessionSnapshot = { status: 'checking', user: null, busy: false, error: null };
function useAuthSessionController() {
  const service = usePluginService<AuthSessionService>(AUTH_SESSION_SERVICE);
  return useMemo(() => ({
    getSnapshot: () => service?.getSnapshot() ?? fallback,
    subscribe: (listener: () => void) => service?.subscribe(listener) ?? (() => {}),
    session: service === undefined ? undefined : {
      signIn: (input: Parameters<AuthSessionService['signIn']>[0]) => service.signIn(input),
      signOut: () => service.signOut(),
    },
    serviceAvailable: service !== undefined,
    signIn: (input: Parameters<AuthSessionService['signIn']>[0]) => {
      if (!service) return Promise.reject(new Error('AUTH_SESSION_SERVICE_UNAVAILABLE'));
      return service.signIn(input);
    },
    signOut: () => {
      if (!service) return Promise.reject(new Error('AUTH_SESSION_SERVICE_UNAVAILABLE'));
      return service.signOut();
    },
  }), [service]);
}

export type AuthSessionController = ReturnType<typeof useAuthSessionController>;
export function useAuthSession(): AuthSessionController;
export function useAuthSession<T>(selector: (snapshot: AuthSessionSnapshot) => T): T;
export function useAuthSession<T>(selector: ((snapshot: AuthSessionSnapshot) => T) | undefined): AuthSessionController | T;
export function useAuthSession<T>(selector?: (snapshot: AuthSessionSnapshot) => T): AuthSessionController | T {
  const controller = useAuthSessionController();
  return usePluginService(controller, selector);
}
