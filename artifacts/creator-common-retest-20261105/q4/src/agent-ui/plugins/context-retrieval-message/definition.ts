import { defineDataMessageUI, type UIPluginDefinition } from '@za38.03/agent-ui-plugins';
import implementation from '@za38.03/agent-ui-plugins/context-retrieval-message';
import { ContextRetrievalMessagePlugin } from './index';
const definition: UIPluginDefinition = {
  manifest: implementation.manifest,
  provides: [],
  inject: [],
  optionalInject: [],
  dataMessageUIs: [defineDataMessageUI<unknown>({ name: 'CONTEXT_CONTENT', render: ContextRetrievalMessagePlugin })],
  Component: () => null,
};
export default definition;
