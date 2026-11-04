import type { UIPluginDefinition } from '@za38.03/agent-ui-plugins';
import implementation from '@za38.03/agent-ui-plugins/lexical-composer-input';
import { ConversationLexicalComposerInput } from './index';
const definition: UIPluginDefinition = {
  manifest: implementation.manifest,
  provides: [],
  inject: [],
  optionalInject: [],
  Component: ConversationLexicalComposerInput,
};
export default definition;
