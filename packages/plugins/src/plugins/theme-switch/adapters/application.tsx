import { ThemeSwitchPlugin as Implementation } from "@za38.03/agent-ui-plugins/theme-switch";
import type { ComponentProps } from "react";
import {usePluginService} from "../../runtime/plugins";
import {usePluginInstance} from "../../runtime/context";
import {AGENT_UI_THEME_SERVICE,type AgentUIThemeService} from "../../services/agent-ui-theme";

export function ThemeSwitchPlugin(props: ComponentProps<typeof Implementation>) {
  const instance=usePluginInstance();
  const service=usePluginService<AgentUIThemeService>(AGENT_UI_THEME_SERVICE);
  return <Implementation service={service} contextId={instance.id} {...props} />;
}
