import { parseUIPluginManifest, type UIPluginDefinition } from '@za38.03/agent-ui-plugins/contracts';
import { ConversationToolFallbackPlugin } from './index';
import manifestJson from './manifest.json';

export const conversationToolFallbackPlugin: UIPluginDefinition = {
  manifest: parseUIPluginManifest(manifestJson),
  Component: ConversationToolFallbackPlugin,
};

export default conversationToolFallbackPlugin;
