import { useEffect } from 'react';
import { useAuiEvent } from '@assistant-ui/react';
import { usePluginService } from '@za38.03/agent-ui-runtime/plugin-api';
import { ConversationSkills, type ConversationSkillsProps } from './skills.js';
import { CONVERSATION_SKILLS_SERVICE, type ConversationSkillsService } from './service.js';
import { useConversationSkillsState } from './use-skills.js';

export type ConversationSkillsPluginProps = Omit<ConversationSkillsProps,
  'selectedSkillId' | 'defaultSelectedSkillId' | 'onSelectedSkillChange' | 'scopeKey'>;
export function ConversationSkillsBar(props: ConversationSkillsPluginProps) {
  const service = usePluginService<ConversationSkillsService>(CONVERSATION_SKILLS_SERVICE);
  const { selected, threadId, composer, disabled } = useConversationSkillsState(service);
  useAuiEvent('composer.send', event => {
    if (event.messageId === undefined) service?.clear(event.threadId);
  });
  useAuiEvent('threads.selectionChanged', event => service?.clear(event.previousThreadId));
  useEffect(() => {
    if (!selected) return;
    const current = props.items?.find(item => item.kind === 'skill' && item.id === selected.id && !item.disabled);
    if (!current) service?.clear(threadId);
    else if (current.kind === 'skill' && (current.label !== selected.label || current.description !== selected.description)) service?.updatePresentation(threadId, current);
  }, [props.items, selected, service, threadId]);
  return <ConversationSkills {...props}
    scopeKey={threadId}
    disabled={disabled || props.disabled || !service}
    selectedSkillId={selected?.id ?? null}
    onSelectedSkillChange={skill => {
      if (skill && composer) service?.select(threadId, skill, composer);
      else service?.clear(threadId);
    }} />;
}
