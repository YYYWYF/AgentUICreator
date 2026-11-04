import { type UIPluginDefinition, parseUIPluginManifest } from '@za38.03/agent-ui-plugins/contracts';

import { AGENT_UI_LOCALE_SERVICE } from '@za38.03/agent-ui-runtime/ui/services/agent-ui-locale';
import { AGENT_UI_THEME_SERVICE } from '@za38.03/agent-ui-runtime/ui/services/agent-ui-theme';
import { ThemeSwitchPlugin } from './index';
import manifestJson from './manifest.json';

export const themeSwitchPlugin: UIPluginDefinition = {
  manifest: parseUIPluginManifest(manifestJson),
  inject: [AGENT_UI_THEME_SERVICE],
  optionalInject: [AGENT_UI_LOCALE_SERVICE],
  Component: ThemeSwitchPlugin,
};

export default themeSwitchPlugin;
