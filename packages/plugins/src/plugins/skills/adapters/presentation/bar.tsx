import { useEffect, useRef, useState } from 'react';
import { useComposer } from '@za38.03/agent-ui-plugins/composer-support';
import { ConversationSkills, type ConversationSkillsProps } from './skills.js';
import { useAgentUILocale } from '../../../../locale.js';
import { useConversationSkillsState } from './use-skills.js';

export type ConversationSkillsPluginProps = Omit<ConversationSkillsProps,
  'selectedSkillId' | 'defaultSelectedSkillId' | 'onSelectedSkillChange' | 'scopeKey'>;
export function ConversationSkillsBar(props: ConversationSkillsPluginProps) {
  const composer = useComposer();
  const { service, selected, threadId, disabled } = useConversationSkillsState();
  const [failed, setFailed] = useState(false);
  const chosen = useRef<string | null>(null);
  const labels = useAgentUILocale('skills');
  useEffect(() => { setFailed(false); chosen.current = null; }, [threadId]);
  useEffect(() => {
    if (!selected || selected.id !== chosen.current) return;
    const current = props.items?.find(item => item.kind === 'skill' && item.id === selected.id && !item.disabled);
    if (!current) service?.clear(threadId);
    else if (current.label !== selected.label) {
      const value = { id: current.id, label: current.label };
      service?.select(threadId, value, composer);
    }
  }, [props.items, selected, service, threadId, composer]);
  return <><ConversationSkills {...props} scopeKey={threadId} disabled={!service || disabled || !!props.disabled}
    selectedSkillId={selected?.id ?? null} onSelectedSkillChange={skill => {
      try {
        if (skill) {
          const value = { id: skill.id, label: skill.label };
          service?.select(threadId, value, composer);
        } else service?.clear(threadId);
        chosen.current = skill?.id ?? null;
        setFailed(false);
      } catch { setFailed(true); }
    }} />{failed && <p role='alert'>{labels.selectionFailed}</p>}</>;
}
