import { AuthGatePlugin as Implementation } from "@za38.03/agent-ui-plugins/auth-gate";
import type { ComponentProps } from "react";
import {usePluginService,usePluginServiceSnapshot} from "../../runtime/plugins";
import type {AuthSessionService,AuthSessionSnapshot} from "@za38.03/agent-ui-plugins/auth-gate";
const fallback:AuthSessionSnapshot={status:"checking",user:null,busy:false,error:null};

export function AuthGatePlugin(props: ComponentProps<typeof Implementation>) {
  const session=usePluginService<AuthSessionService>("auth.session");
  const state=usePluginServiceSnapshot(session,fallback);
  return <Implementation session={session} state={state} {...props} />;
}
