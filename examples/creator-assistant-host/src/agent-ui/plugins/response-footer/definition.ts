import { type UIPluginDefinition } from '@za38.03/agent-ui-plugins';
import implementation from '@za38.03/agent-ui-plugins/response-footer';
import { ConversationResponseFooterPlugin } from './index';
const definition: UIPluginDefinition = {
  manifest: implementation.manifest,
  provides: [],
  inject: [],
  optionalInject: [],
  Component: ConversationResponseFooterPlugin,
};
export default definition;
