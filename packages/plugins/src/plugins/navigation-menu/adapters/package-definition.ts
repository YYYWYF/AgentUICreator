import { parseUIPluginManifest, type UIPluginDefinition } from '@za38.03/agent-ui-plugins/contracts';
import { NavigationMenuPlugin } from './index';
import manifest from './manifest.json';
export const navigationMenuPlugin: UIPluginDefinition = {
  manifest: parseUIPluginManifest(manifest),
  inject: ['agent-ui.stack-navigation'],
  Component: NavigationMenuPlugin,
};
export default navigationMenuPlugin;
