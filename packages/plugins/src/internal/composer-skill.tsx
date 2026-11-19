import { useAuiState } from '@assistant-ui/react';
import { readConversationSkillData } from '../plugins/skills/adapters/presentation/skill-data.js';
import { ConversationSkillSelection } from '../plugins/skills-selection/adapters/presentation/selection.js';

export function ConversationMessageSkill() {
  const value = useAuiState(state => state.message.role === 'user'
    ? state.message.metadata.custom.skill
    : undefined);
  const skill = readConversationSkillData(value);
  return <ConversationSkillSelection className='col-start-2 justify-self-end' selectedSkill={skill} />;
}
