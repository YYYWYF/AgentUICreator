import type { UIPluginDefinition } from '@za38.03/agent-ui-plugins';
import implementation from '@za38.03/agent-ui-plugins/skills';
import { SkillsPlugin } from './index';
const definition: UIPluginDefinition = {
  manifest: implementation.manifest,
  provides: ['conversation.skills'],
  optionalInject: ['agent-ui.locale'],
  setup: context => implementation.setup?.(context),
  Component: SkillsPlugin,
};
export default definition;
