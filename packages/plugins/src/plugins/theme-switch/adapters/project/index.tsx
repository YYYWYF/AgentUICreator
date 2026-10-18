import "./styles.css";
import { CanonicalThemeSwitchPlugin as Implementation } from "@za38.03/agent-ui-plugins";
import type { ComponentProps } from "react";
import type { UIPluginComponentProps } from "../../framework/contracts/ui-plugin";
import {usePluginService} from "../../runtime/plugins";
import {usePluginInstance} from "../../runtime/context";
import {AGENT_UI_THEME_SERVICE,type AgentUIThemeService} from "../../services/agent-ui-theme";

export function ThemeSwitchPlugin(props: ComponentProps<typeof Implementation> & Partial<UIPluginComponentProps>) {
  const instance=usePluginInstance();
  const service=usePluginService<AgentUIThemeService>(AGENT_UI_THEME_SERVICE);
  return <Implementation service={service} contextId={instance.id} {...props} />;
}
