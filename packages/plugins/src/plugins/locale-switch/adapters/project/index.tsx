import { usePluginService } from "@za38.03/agent-ui-plugins";
import { AGENT_UI_LOCALE_SERVICE, type AgentUILocaleService } from "@za38.03/agent-ui-runtime/ui/services/agent-ui-locale";
import "./styles.css";
import { CanonicalLocaleSwitchPlugin as Implementation } from "@za38.03/agent-ui-plugins";
import type { ComponentProps } from "react";
import type { UIPluginComponentProps } from "@za38.03/agent-ui-plugins/contracts";
import {usePluginInstance} from "@za38.03/agent-ui-runtime/ui/runtime/context/index";

export function LocaleSwitchPlugin({ renderSlot: _renderSlot, renderScopedSlot: _renderScopedSlot, ...props }: ComponentProps<typeof Implementation> & Partial<UIPluginComponentProps>) {
  const instance=usePluginInstance();
  const service = usePluginService<AgentUILocaleService>(AGENT_UI_LOCALE_SERVICE);
  return <Implementation service={service} contextId={instance.id} {...props} />;
}
