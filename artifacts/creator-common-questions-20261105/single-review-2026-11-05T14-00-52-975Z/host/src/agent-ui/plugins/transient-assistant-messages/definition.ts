import { type UIPluginDefinition } from '@za38.03/agent-ui-plugins';
import implementation from '@za38.03/agent-ui-plugins/transient-assistant-messages';
import { TransientAssistantMessagesPlugin } from './index';
const definition: UIPluginDefinition = {
  manifest: implementation.manifest,
  provides: [],
  inject: [],
  optionalInject: [],
  Component: TransientAssistantMessagesPlugin,
};
export default definition;
