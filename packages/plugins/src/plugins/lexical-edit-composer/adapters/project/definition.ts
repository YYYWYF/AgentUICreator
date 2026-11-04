import { parseUIPluginManifest, type UIPluginDefinition } from '@za38.03/agent-ui-plugins/contracts';
import { ConversationLexicalEditComposer } from './index';
import manifestJson from './manifest.json';

export const conversationLexicalEditComposerPlugin: UIPluginDefinition = {
  manifest: parseUIPluginManifest(manifestJson),
  Component: ConversationLexicalEditComposer,
};
export default conversationLexicalEditComposerPlugin;
