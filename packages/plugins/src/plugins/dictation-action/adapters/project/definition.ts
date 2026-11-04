import { parseUIPluginManifest, type UIPluginDefinition } from '@za38.03/agent-ui-plugins/contracts';
import { ConversationDictationActionPlugin } from './index';
import manifestJson from './manifest.json';

export const conversationDictationActionPlugin: UIPluginDefinition = {
  manifest: parseUIPluginManifest(manifestJson),
  Component: ConversationDictationActionPlugin,
};

export default conversationDictationActionPlugin;
