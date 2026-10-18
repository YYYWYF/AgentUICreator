import "./styles.css";
import { CanonicalAuthGatePlugin as Implementation } from "@za38.03/agent-ui-plugins";
import type { ComponentProps } from "react";
import type { UIPluginComponentProps } from "../../framework/contracts/ui-plugin";
import {usePluginService,usePluginServiceSnapshot} from "../../runtime/plugins";
import type {AuthSessionService,AuthSessionSnapshot} from "@za38.03/agent-ui-plugins/auth-gate";
const fallback:AuthSessionSnapshot={status:"checking",user:null,busy:false,error:null};

export function LoginScreen(props: ComponentProps<typeof Implementation> & Partial<UIPluginComponentProps>) {
  const session=usePluginService<AuthSessionService>("auth.session");
  const state=usePluginServiceSnapshot(session,fallback);
  return <Implementation session={session} state={state} {...props} />;
}
