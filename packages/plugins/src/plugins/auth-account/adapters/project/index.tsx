import "./styles.css";
import { CanonicalAuthAccountPlugin as Implementation } from "@za38.03/agent-ui-plugins";
import type { ComponentProps } from "react";
import type { UIPluginComponentProps } from "../../framework/contracts/ui-plugin";
import {useHostUser} from "../../application/host-user";
import {usePluginService,usePluginServiceSnapshot} from "../../runtime/plugins";
import type {AuthSessionService,AuthSessionSnapshot} from "@za38.03/agent-ui-plugins/auth-gate";
const fallback:AuthSessionSnapshot={status:"checking",user:null,busy:false,error:null};

export function AccountView(props: ComponentProps<typeof Implementation> & Partial<UIPluginComponentProps>) {
  const hostUser=useHostUser();
  const session=usePluginService<AuthSessionService>("auth.session");
  const snapshot=usePluginServiceSnapshot(session,fallback);
  return <Implementation hostUser={hostUser} session={session} snapshot={snapshot} {...props} />;
}
