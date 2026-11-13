import {
  parseUIPluginManifest,
  type UIPluginDefinition,
} from '@za38.03/agent-ui-plugins/contracts';
import { SkillsPlugin } from './index';
import manifestJson from './manifest.json';
import { CONVERSATION_SKILLS_SERVICE, createConversationSkillsService } from '@za38.03/agent-ui-plugins';

export const skillsPlugin: UIPluginDefinition = {
  manifest: parseUIPluginManifest(manifestJson),
  provides: ['conversation.skills'],
  setup: ({ services }) => {
    const service = createConversationSkillsService();
    services.provide(CONVERSATION_SKILLS_SERVICE, service);
    return () => service.dispose();
  },
  optionalInject: ['agent-ui.locale'],
  Component: SkillsPlugin,
};
export default skillsPlugin;
