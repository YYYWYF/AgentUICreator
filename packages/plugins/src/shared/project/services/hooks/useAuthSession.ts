import { useMemo } from "react";
import { usePluginService, usePluginServiceSnapshot } from "@za38.03/agent-ui-plugins";
import {
  AUTH_SESSION_SERVICE,
  type AuthSessionService,
  type AuthSessionSnapshot,
} from "../auth/session";

const fallback: AuthSessionSnapshot = {
  status: "checking",
  user: null,
  busy: false,
  error: null,
};

/** Observes the provider's session; restore and disposal remain provider-owned. */
export function useAuthSession() {
  const service = usePluginService<AuthSessionService>(AUTH_SESSION_SERVICE);
  const snapshot = usePluginServiceSnapshot(service, fallback);
  const session = useMemo<Pick<AuthSessionService, "signIn" | "signOut"> | undefined>(
    () => service === undefined ? undefined : {
      signIn: input => service.signIn(input),
      signOut: () => service.signOut(),
    },
    [service],
  );

  return { snapshot, session, serviceAvailable: service !== undefined };
}
