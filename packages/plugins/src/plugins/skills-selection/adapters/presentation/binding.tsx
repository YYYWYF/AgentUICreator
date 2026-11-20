import { ConversationSkillSelection, type ConversationSkillSelectionProps } from './selection.js';
import { useSkillSelection } from '../../../../public.js';

export type ConversationSkillsSelectionPluginProps = Omit<
  ConversationSkillSelectionProps,
  'selectedSkill' | 'onRemove'
>;

export function ConversationSkillsSelection(props: ConversationSkillsSelectionPluginProps) {
  const skills = useSkillSelection();
  const selected = useSkillSelection(snapshot => snapshot.selected);
  const disabled = useSkillSelection(snapshot => snapshot.disabled);
  return (
    <ConversationSkillSelection
      {...props}
      data-ui-plugin='skills-selection'
      selectedSkill={selected}
      disabled={disabled || !!props.disabled}
      onRemove={() => skills.clear()}
    />
  );
}
