import { type UIPluginDefinition } from '@za38.03/agent-ui-plugins';
import implementation from '@za38.03/agent-ui-plugins/tool-group';
import { ConversationToolGroupPlugin } from './index';
const definition: UIPluginDefinition = {
  manifest: implementation.manifest,
  provides: [],
  inject: [],
  optionalInject: [],
  Component: ConversationToolGroupPlugin,
};
export default definition;
