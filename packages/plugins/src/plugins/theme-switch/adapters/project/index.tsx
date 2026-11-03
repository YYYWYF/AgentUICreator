import { usePluginService } from "@za38.03/agent-ui-plugins";
import { AGENT_UI_THEME_SERVICE, type AgentUIThemeService } from "@za38.03/agent-ui-runtime/ui/services/agent-ui-theme";
import "./styles.css";
import { CanonicalThemeSwitchPlugin as Implementation } from "@za38.03/agent-ui-plugins";
import type { ComponentProps } from "react";
import type { UIPluginComponentProps } from "@za38.03/agent-ui-plugins/contracts";
import {usePluginInstance} from "@za38.03/agent-ui-runtime/ui/runtime/context/index";

export function ThemeSwitchPlugin({ renderSlot: _renderSlot, renderScopedSlot: _renderScopedSlot, ...props }: ComponentProps<typeof Implementation> & Partial<UIPluginComponentProps>) {
  const instance=usePluginInstance();
  const service = usePluginService<AgentUIThemeService>(AGENT_UI_THEME_SERVICE);
  return <Implementation service={service} contextId={instance.id} {...props} />;
}
