import { usePluginInstance, usePluginService } from '@za38.03/agent-ui-plugins';
import { LocaleSwitchPlugin as Implementation } from '@za38.03/agent-ui-plugins/locale-switch';
import {
  AGENT_UI_LOCALE_SERVICE,
  type AgentUILocaleService,
} from '@za38.03/agent-ui-runtime/ui/services/agent-ui-locale';
import type { ComponentProps } from 'react';

export function LocaleSwitchPlugin(props: ComponentProps<typeof Implementation>) {
  const instance = usePluginInstance();
  const service = usePluginService<AgentUILocaleService>(AGENT_UI_LOCALE_SERVICE);
  return <Implementation service={service} contextId={instance.id} {...props} />;
}
