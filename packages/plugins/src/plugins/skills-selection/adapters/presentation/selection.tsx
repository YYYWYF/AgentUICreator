import type { ComponentProps } from 'react';
import { Sparkles, X } from 'lucide-react';
import { useAgentUILocale, type ConversationSkill } from '../../../../public.js';

export interface ConversationSkillSelectionProps extends ComponentProps<'div'> {
  selectedSkill?: ConversationSkill | null;
  onRemove?: () => void;
  disabled?: boolean;
}
export function ConversationSkillSelection({ selectedSkill, onRemove, disabled, ...props }: ConversationSkillSelectionProps) {
  const labels = useAgentUILocale('skills');
  if (!selectedSkill) return null;
  return <div {...props} data-ui-plugin='skills-selection' data-agent-ui-owned=''
    className={['skills-selection', props.className].filter(Boolean).join(' ')}>
    <span className='skills-selection-chip'>
      {selectedSkill.icon ?? <Sparkles aria-hidden='true' />}<span>{selectedSkill.label}</span>
      <button type='button' disabled={disabled} onClick={onRemove} aria-label={`${labels.remove}: ${selectedSkill.label}`}><X aria-hidden='true' /></button>
    </span>
  </div>;
}
