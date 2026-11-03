import { useAuthSession } from "../../hooks/useAuthSession";
import { AuthGatePlugin as Implementation } from "@za38.03/agent-ui-plugins/auth-gate";
import type { ComponentProps } from "react";

export function AuthGatePlugin(props: ComponentProps<typeof Implementation>) {
  const { session, snapshot: state } = useAuthSession();
  return <Implementation session={session} state={state} {...props} />;
}
