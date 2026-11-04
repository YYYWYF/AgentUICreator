import { parseUIPluginManifest, type UIPluginDefinition } from '@za38.03/agent-ui-plugins/contracts';
import { ConversationReloadActionPlugin } from './index';
import manifestJson from './manifest.json';

export const conversationReloadActionPlugin: UIPluginDefinition = {
  manifest: parseUIPluginManifest(manifestJson),
  Component: ConversationReloadActionPlugin,
};

export default conversationReloadActionPlugin;
