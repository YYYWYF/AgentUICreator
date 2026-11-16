import type { UIPluginDefinition } from '@za38.03/agent-ui-plugins/contracts';
import implementation from '@za38.03/agent-ui-plugins/workbench-panel-actions';
import { WorkbenchPanelActionsPlugin } from './index';
const definition: UIPluginDefinition = {
  manifest: implementation.manifest,
  provides: [],
  inject: ['agent-ui.workbench-panel'],
  optionalInject: [],
  Component: WorkbenchPanelActionsPlugin,
};
export default definition;
