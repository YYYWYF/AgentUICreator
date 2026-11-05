import { type UIPluginDefinition } from '@za38.03/agent-ui-plugins';
import implementation from '@za38.03/agent-ui-plugins/export-markdown-action';
import { ConversationExportMarkdownActionPlugin } from './index';
const definition: UIPluginDefinition = {
  manifest: implementation.manifest,
  provides: [],
  inject: [],
  optionalInject: ['agent-ui.locale'],
  Component: ConversationExportMarkdownActionPlugin,
};
export default definition;
