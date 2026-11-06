import { type UIPluginDefinition } from '@za38.03/agent-ui-plugins';
import implementation from '@za38.03/agent-ui-plugins/reasoning';
import { ConversationReasoningPlugin } from './index';
const definition: UIPluginDefinition = {
  manifest: implementation.manifest,
  provides: [],
  inject: [],
  optionalInject: [],
  Component: ConversationReasoningPlugin,
};
export default definition;
