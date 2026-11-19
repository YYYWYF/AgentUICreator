import { CanonicalThemeSwitchPlugin as Implementation, usePluginService } from '@za38.03/agent-ui-plugins';
import type { UIPluginComponentProps } from '@za38.03/agent-ui-plugins/contracts';
import { AGENT_UI_THEME_SERVICE, type AgentUIThemeService } from '@za38.03/agent-ui-runtime/ui/services/agent-ui-theme';
import type { ComponentProps } from 'react';
import './styles.css';

export function ThemeSwitchPlugin({
  renderSlot: _renderSlot,
  renderScopedSlot: _renderScopedSlot,
  ...props
}: ComponentProps<typeof Implementation> & Partial<UIPluginComponentProps>) {
  const service = usePluginService<AgentUIThemeService>(AGENT_UI_THEME_SERVICE);
  return <Implementation service={service} {...props} />;
}
