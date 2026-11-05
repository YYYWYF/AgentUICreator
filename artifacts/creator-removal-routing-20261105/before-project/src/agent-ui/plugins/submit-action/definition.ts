import { type UIPluginDefinition } from '@za38.03/agent-ui-plugins';
import implementation from '@za38.03/agent-ui-plugins/submit-action';
import { ConversationSubmitActionPlugin } from './index';
const definition: UIPluginDefinition = {
  manifest: implementation.manifest,
  provides: [],
  inject: [],
  optionalInject: ['agent-ui.locale'],
  Component: ConversationSubmitActionPlugin,
};
export default definition;
