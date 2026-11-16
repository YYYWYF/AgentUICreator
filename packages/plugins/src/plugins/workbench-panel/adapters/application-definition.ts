import type { UIPluginDefinition } from '@za38.03/agent-ui-plugins/contracts';
import implementation from '@za38.03/agent-ui-plugins/workbench-panel';
import { WorkbenchPanelPlugin } from './index';
const definition: UIPluginDefinition = {
  manifest: implementation.manifest,
  provides: ["agent-ui.workbench-panel"],
  inject: [],
  optionalInject: [],
  setup: context => implementation.setup?.(context),
  Component: WorkbenchPanelPlugin,
};
export default definition;
