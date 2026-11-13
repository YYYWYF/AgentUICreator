import { parseUIPluginManifest, type UIPluginDefinition } from '@za38.03/agent-ui-plugins/contracts';
import { SkillsSelectionPlugin } from './index';
import manifestJson from './manifest.json';
export const skillsSelectionPlugin: UIPluginDefinition = {
  manifest: parseUIPluginManifest(manifestJson),
  inject: ['conversation.skills'],
  optionalInject: ['agent-ui.locale'],
  Component: SkillsSelectionPlugin,
};
export default skillsSelectionPlugin;
