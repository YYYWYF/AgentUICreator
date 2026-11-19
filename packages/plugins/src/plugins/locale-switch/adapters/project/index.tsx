import { CanonicalLocaleSwitchPlugin as Implementation, usePluginService } from '@za38.03/agent-ui-plugins';
import type { UIPluginComponentProps } from '@za38.03/agent-ui-plugins/contracts';
import {
  AGENT_UI_LOCALE_SERVICE,
  type AgentUILocaleService,
} from '@za38.03/agent-ui-runtime/ui/services/agent-ui-locale';
import type { ComponentProps } from 'react';
import './styles.css';

export function LocaleSwitchPlugin({
  renderSlot: _renderSlot,
  renderScopedSlot: _renderScopedSlot,
  ...props
}: ComponentProps<typeof Implementation> & Partial<UIPluginComponentProps>) {
  const service = usePluginService<AgentUILocaleService>(AGENT_UI_LOCALE_SERVICE);
  return <Implementation service={service} {...props} />;
}
