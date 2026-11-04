import { type UIPluginDefinition, parseUIPluginManifest } from '@za38.03/agent-ui-plugins/contracts';

import { AGENT_UI_LOCALE_SERVICE } from '@za38.03/agent-ui-runtime/ui/services/agent-ui-locale';
import { LocaleProviderPlugin } from './index';
import { createAgentUILocaleService } from './locale-service';
import manifestJson from './manifest.json';

export const localeProviderPlugin: UIPluginDefinition = {
  manifest: parseUIPluginManifest(manifestJson),
  provides: [AGENT_UI_LOCALE_SERVICE],
  setup: ({ services }) => {
    const locale = createAgentUILocaleService();
    services.provide(AGENT_UI_LOCALE_SERVICE, locale);
  },
  Component: LocaleProviderPlugin,
};

export default localeProviderPlugin;
