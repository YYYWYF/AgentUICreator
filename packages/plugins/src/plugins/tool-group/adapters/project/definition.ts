import { parseUIPluginManifest, type UIPluginDefinition } from '@za38.03/agent-ui-plugins/contracts';
import { ConversationToolGroupPlugin } from './index';
import manifestJson from './manifest.json';

export const conversationToolGroupPlugin: UIPluginDefinition = {
  manifest: parseUIPluginManifest(manifestJson),
  Component: ConversationToolGroupPlugin,
};

export default conversationToolGroupPlugin;
