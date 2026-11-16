import { parseUIPluginManifest, type UIPluginDefinition } from '@za38.03/agent-ui-plugins/contracts';
import { WorkbenchPanelActionsPlugin } from './index';
import manifest from './manifest.json';
export const workbenchPanelActionsPlugin: UIPluginDefinition = {
  manifest: parseUIPluginManifest(manifest),
  provides: [],
  inject: ["agent-ui.workbench-panel"],
  optionalInject: [],
  Component: WorkbenchPanelActionsPlugin,
};
export default workbenchPanelActionsPlugin;
export type { WorkbenchPanelActionsProps } from '@za38.03/agent-ui-plugins';
