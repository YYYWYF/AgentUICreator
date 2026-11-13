import { usePluginService } from '@za38.03/agent-ui-runtime/plugin-api';
import { CONVERSATION_SKILLS_SERVICE, type ConversationSkillsService } from '../../../skills/adapters/presentation/service.js';
import { useConversationSkillsState } from '../../../skills/adapters/presentation/use-skills.js';
import { ConversationSkillSelection, type ConversationSkillSelectionProps } from './selection.js';

export type ConversationSkillsSelectionPluginProps = Omit<ConversationSkillSelectionProps, 'selectedSkill' | 'onRemove'>;
export function ConversationSkillsSelection(props: ConversationSkillsSelectionPluginProps) {
  const service = usePluginService<ConversationSkillsService>(CONVERSATION_SKILLS_SERVICE);
  const { selected, threadId, disabled } = useConversationSkillsState(service);
  return <ConversationSkillSelection {...props} selectedSkill={selected}
    disabled={disabled || !!props.disabled} onRemove={() => service?.clear(threadId)} />;
}
