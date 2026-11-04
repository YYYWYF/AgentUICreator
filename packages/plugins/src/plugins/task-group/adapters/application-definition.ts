import type { UIPluginDefinition } from '@za38.03/agent-ui-plugins';
import implementation from '@za38.03/agent-ui-plugins/task-group';
import { TaskGroupPlugin } from './index';
const definition: UIPluginDefinition = {
  manifest: implementation.manifest,
  provides: [],
  inject: [],
  optionalInject: [],
  Component: TaskGroupPlugin,
};
export default definition;
