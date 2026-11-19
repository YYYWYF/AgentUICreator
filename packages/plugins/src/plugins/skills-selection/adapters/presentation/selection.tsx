import type { ComponentProps } from 'react';
import { Sparkles, X } from 'lucide-react';
import type { ConversationSkillData } from '../../../../public.js';
import { useAgentUILocale } from '../../../../locale.js';

export interface ConversationSkillSelectionProps extends Omit<ComponentProps<'div'>, 'children'> {
  selectedSkill?: ConversationSkillData | null;
  onRemove?: () => void;
  disabled?: boolean;
}

export function ConversationSkillSelection({
  selectedSkill,
  onRemove,
  disabled,
  ...props
}: ConversationSkillSelectionProps) {
  const labels = useAgentUILocale('skills');
  if (!selectedSkill) return null;
  return (
    <div
      {...props}
      data-agent-ui-owned=''
      data-slot={onRemove ? 'composer-skill' : 'message-skill'}
      className={['skills-selection flex min-w-0', props.className].filter(Boolean).join(' ')}
    >
      <span className='skills-selection-chip inline-flex max-w-full items-center gap-1.5 rounded-lg bg-[var(--agent-brand-selected)] px-[7px] py-1 text-xs leading-5 text-[var(--agent-brand-active)]'>
        <Sparkles aria-hidden='true' className='size-4 shrink-0' />
        <span className='wrap-anywhere'>{selectedSkill.label}</span>
        {onRemove && (
          <button
            type='button'
            disabled={disabled}
            onClick={onRemove}
            className='inline-flex cursor-pointer items-center justify-center rounded border-0 bg-transparent p-0.5 text-inherit hover:bg-[var(--agent-brand-hover)] focus-visible:outline-2 focus-visible:outline-[var(--agent-brand-focus-border)] disabled:cursor-not-allowed disabled:opacity-45'
            aria-label={`${labels.remove}: ${selectedSkill.label}`}
          >
            <X aria-hidden='true' className='size-4 shrink-0' />
          </button>
        )}
      </span>
    </div>
  );
}
