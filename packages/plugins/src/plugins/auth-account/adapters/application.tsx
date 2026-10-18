import { AuthAccountPlugin as Implementation } from "@za38.03/agent-ui-plugins/auth-account";
import type { ComponentProps } from "react";
import {useHostUser} from "../../application/host-user";
import {usePluginService,usePluginServiceSnapshot} from "../../runtime/plugins";
import type {AuthSessionService,AuthSessionSnapshot} from "@za38.03/agent-ui-plugins/auth-gate";
const fallback:AuthSessionSnapshot={status:"checking",user:null,busy:false,error:null};

export function AuthAccountPlugin(props: ComponentProps<typeof Implementation>) {
  const hostUser=useHostUser();
  const session=usePluginService<AuthSessionService>("auth.session");
  const snapshot=usePluginServiceSnapshot(session,fallback);
  return <Implementation hostUser={hostUser} session={session} snapshot={snapshot} {...props} />;
}
