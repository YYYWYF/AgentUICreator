import { ConversationSkillSelection, type ConversationSkillSelectionProps } from './selection.js';
import { useConversationSkillsState } from '../../../../public.js';

export type ConversationSkillsSelectionPluginProps = Omit<
  ConversationSkillSelectionProps,
  'selectedSkill' | 'onRemove'
>;

export function ConversationSkillsSelection(props: ConversationSkillsSelectionPluginProps) {
  const { service, selected, threadId, disabled } = useConversationSkillsState();
  return (
    <ConversationSkillSelection
      {...props}
      data-ui-plugin='skills-selection'
      selectedSkill={selected}
      disabled={disabled || !!props.disabled}
      onRemove={() => service?.clear(threadId)}
    />
  );
}
