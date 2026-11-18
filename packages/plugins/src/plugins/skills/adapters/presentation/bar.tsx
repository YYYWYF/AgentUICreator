import { useContext, useEffect, useState } from 'react';
import { useAuiEvent } from '@assistant-ui/react';
import { PluginInstanceContext, useComposer, usePluginService } from '@za38.03/agent-ui-runtime/plugin-api';
import { ConversationSkills, type ConversationSkillsProps } from './skills.js';
import { CONVERSATION_SKILLS_SERVICE, type ConversationSkillsService, type ConversationSkillRequestAdapter } from './service.js';
import { useAgentUILocale } from '../../../../locale.js';
import { useConversationSkillsState } from './use-skills.js';

export type ConversationSkillsPluginProps = Omit<ConversationSkillsProps,
  'selectedSkillId' | 'defaultSelectedSkillId' | 'onSelectedSkillChange' | 'scopeKey'> & { requestAdapter?: ConversationSkillRequestAdapter | undefined };
export function ConversationSkillsBar({ requestAdapter, ...props }: ConversationSkillsPluginProps) {
  const instance = useContext(PluginInstanceContext);
  const composer = useComposer(instance?.instance.pluginId === 'skills' ? undefined : 'skills');
  const [failed, setFailed] = useState(false);
  const labels = useAgentUILocale('skills');
  const service = usePluginService<ConversationSkillsService>(CONVERSATION_SKILLS_SERVICE);
  const { selected, threadId, disabled } = useConversationSkillsState(service);
  useEffect(() => setFailed(false), [threadId]);
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
  return <><ConversationSkills {...props}
    scopeKey={threadId}
    disabled={disabled || props.disabled || !service}
    selectedSkillId={selected?.id ?? null}
    onSelectedSkillChange={skill => {
      try {
        if (skill) service?.select(threadId, skill, composer, requestAdapter);
        else service?.clear(threadId);
        setFailed(false);
      } catch { setFailed(true); }
    }} />{failed && <p role='alert'>{labels.selectionFailed}</p>}</>;
}
