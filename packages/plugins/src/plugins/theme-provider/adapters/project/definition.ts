import { type UIPluginDefinition, parseUIPluginManifest } from '@za38.03/agent-ui-plugins/contracts';

import { AGENT_UI_THEME_SERVICE } from '@za38.03/agent-ui-runtime/ui/services/agent-ui-theme';
import { ThemeProviderPlugin } from './index';
import manifestJson from './manifest.json';
import { createAgentUIThemeService } from './theme-service';

export const themeProviderPlugin: UIPluginDefinition = {
  manifest: parseUIPluginManifest(manifestJson),
  provides: [AGENT_UI_THEME_SERVICE],
  setup: ({ services }) => {
    const theme = createAgentUIThemeService();

    services.provide(AGENT_UI_THEME_SERVICE, theme);
  },
  Component: ThemeProviderPlugin,
};

export default themeProviderPlugin;
