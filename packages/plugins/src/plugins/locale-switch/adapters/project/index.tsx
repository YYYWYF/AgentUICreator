import "./styles.css";
import { CanonicalLocaleSwitchPlugin as Implementation } from "@za38.03/agent-ui-plugins";
import type { ComponentProps } from "react";
import type { UIPluginComponentProps } from "../../framework/contracts/ui-plugin";
import {usePluginService} from "../../runtime/plugins";
import {usePluginInstance} from "../../runtime/context";
import {AGENT_UI_LOCALE_SERVICE,type AgentUILocaleService} from "../../services/agent-ui-locale";

export function LocaleSwitchPlugin(props: ComponentProps<typeof Implementation> & Partial<UIPluginComponentProps>) {
  const instance=usePluginInstance();
  const service=usePluginService<AgentUILocaleService>(AGENT_UI_LOCALE_SERVICE);
  return <Implementation service={service} contextId={instance.id} {...props} />;
}
