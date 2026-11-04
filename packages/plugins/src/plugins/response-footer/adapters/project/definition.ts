import { parseUIPluginManifest, type UIPluginDefinition } from '@za38.03/agent-ui-plugins/contracts';
import { ConversationResponseFooterPlugin } from './index';
import manifestJson from './manifest.json';

export const conversationResponseFooterPlugin: UIPluginDefinition = {
  manifest: parseUIPluginManifest(manifestJson),
  Component: ConversationResponseFooterPlugin,
};

export default conversationResponseFooterPlugin;
