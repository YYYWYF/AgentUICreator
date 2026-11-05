import type { UIPluginDefinition } from '@za38.03/agent-ui-plugins';
import implementation, { createAgentUIThemeService } from '@za38.03/agent-ui-plugins/theme-provider';

import { ThemeProviderPlugin } from './index';

import { AGENT_UI_THEME_SERVICE } from '@za38.03/agent-ui-runtime/ui/services/agent-ui-theme';

export const themeProviderPlugin: UIPluginDefinition = {
  manifest: implementation.manifest,
  provides: [AGENT_UI_THEME_SERVICE],
  setup: implementation.bindSetup(({ services }: Parameters<NonNullable<UIPluginDefinition['setup']>>[0]) => {
    const theme = createAgentUIThemeService();

    services.provide(AGENT_UI_THEME_SERVICE, theme);
  }),
  Component: ThemeProviderPlugin,
};

export default themeProviderPlugin;
