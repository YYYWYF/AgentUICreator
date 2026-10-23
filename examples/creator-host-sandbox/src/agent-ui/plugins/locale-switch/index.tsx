import { LocaleSwitchPlugin as Implementation } from "@za38.03/agent-ui-plugins/locale-switch";
import type { ComponentProps } from "react";
import {usePluginService} from "../../runtime/plugins";
import {usePluginInstance} from "../../runtime/context";
import {AGENT_UI_LOCALE_SERVICE,type AgentUILocaleService} from "../../services/agent-ui-locale";

export function LocaleSwitchPlugin(props: ComponentProps<typeof Implementation>) {
  const instance=usePluginInstance();
  const service=usePluginService<AgentUILocaleService>(AGENT_UI_LOCALE_SERVICE);
  return <Implementation service={service} contextId={instance.id} {...props} />;
}
