import { useAuthSession } from "../../hooks/useAuthSession";
import { AuthAccountPlugin as Implementation } from "@za38.03/agent-ui-plugins/auth-account";
import type { ComponentProps } from "react";
import {useHostUser} from "../../application/host-user";

export function AuthAccountPlugin(props: ComponentProps<typeof Implementation>) {
  const hostUser=useHostUser();
  const { session, snapshot } = useAuthSession();
  return <Implementation hostUser={hostUser} session={session} snapshot={snapshot} {...props} />;
}
