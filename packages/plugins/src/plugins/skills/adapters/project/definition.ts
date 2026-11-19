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
  optionalInject: ['agent-ui.locale'],
  setup({ services }) {
    const service = createConversationSkillsService();
    const release = services.provide(CONVERSATION_SKILLS_SERVICE, service);
    return () => { service.dispose(); release(); };
  },
  Component: SkillsPlugin,
};
export default skillsPlugin;
