import { type UIPluginDefinition } from '@za38.03/agent-ui-plugins';
import implementation from '@za38.03/agent-ui-plugins/navigation-menu';
import { NavigationMenuPlugin } from './index';
const definition: UIPluginDefinition = {
  manifest: implementation.manifest,
  provides: [],
  inject: ['agent-ui.stack-navigation'],
  optionalInject: [],
  Component: NavigationMenuPlugin,
};
export default definition;
