import { useEffect, useRef, useState } from 'react';
import { useComposer } from '@za38.03/agent-ui-plugins/composer-support';
import { ConversationSkills, type ConversationSkillsProps } from './skills.js';
import { useLocale } from '../../../../locale.js';
import { useSkillSelection } from './use-skills.js';

export type ConversationSkillsPluginProps = Omit<ConversationSkillsProps,
  'selectedSkillId' | 'defaultSelectedSkillId' | 'onSelectedSkillChange' | 'scopeKey'>;
export function ConversationSkillsBar(props: ConversationSkillsPluginProps) {
  const composer = useComposer();
  const skills = useSkillSelection();
  const { threadId } = skills;
  const selected = useSkillSelection(snapshot => snapshot.selected);
  const disabled = useSkillSelection(snapshot => snapshot.disabled);
  const [failed, setFailed] = useState(false);
  const chosen = useRef<string | null>(null);
  const labels = useLocale('skills');
  useEffect(() => { setFailed(false); chosen.current = null; }, [threadId]);
  useEffect(() => {
    if (!selected || selected.id !== chosen.current) return;
    const current = props.items?.find(item => item.kind === 'skill' && item.id === selected.id && !item.disabled);
    if (!current) skills.clear();
    else if (current.label !== selected.label) {
      const value = { id: current.id, label: current.label };
      skills.select(value, composer);
    }
  }, [props.items, selected, skills, threadId, composer]);
  return <><ConversationSkills {...props} scopeKey={threadId} disabled={!skills.serviceAvailable || disabled || !!props.disabled}
    selectedSkillId={selected?.id ?? null} onSelectedSkillChange={skill => {
      try {
        if (skill) {
          const value = { id: skill.id, label: skill.label };
          skills.select(value, composer);
        } else skills.clear();
        chosen.current = skill?.id ?? null;
        setFailed(false);
      } catch { setFailed(true); }
    }} />{failed && <p role='alert'>{labels.selectionFailed}</p>}</>;
}
