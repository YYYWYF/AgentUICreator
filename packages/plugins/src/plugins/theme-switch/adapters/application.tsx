import { usePluginInstance, usePluginService } from '@za38.03/agent-ui-plugins';
import { ThemeSwitchPlugin as Implementation } from '@za38.03/agent-ui-plugins/theme-switch';
import { AGENT_UI_THEME_SERVICE, type AgentUIThemeService } from '@za38.03/agent-ui-runtime/ui/services/agent-ui-theme';
import type { ComponentProps } from 'react';

export function ThemeSwitchPlugin(props: ComponentProps<typeof Implementation>) {
  const instance = usePluginInstance();
  const service = usePluginService<AgentUIThemeService>(AGENT_UI_THEME_SERVICE);
  return <Implementation service={service} contextId={instance.id} {...props} />;
}
