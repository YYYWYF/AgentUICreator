import { useContext } from 'react';
import { snapshotAgentUIContext } from '@za38.03/agent-ui-core';
import { PluginInstanceContext } from '@za38.03/agent-ui-runtime/plugin-api';
import { useComposer, type ComposerData } from '@za38.03/agent-ui-plugins/composer-support';
import type { ConversationMentionItem, ConversationCommandRequestItem } from '../../../public.js';

function command(input: ConversationCommandRequestItem): ConversationCommandRequestItem {
  return {
    id: input.id, label: input.label, mode: input.mode,
    ...(input.description === undefined ? {} : { description: input.description }),
    ...(input.disabled === undefined ? {} : { disabled: input.disabled }),
    ...(input.data === undefined ? {} : { data: input.data }),
  };
}
/** Preserve the reference and raw selection; Composer owns request assembly. */
function useRequest<T>(kind: 'mention' | 'command') {
  const instance = useContext(PluginInstanceContext);
  const pluginId = kind === 'mention' ? 'mention-trigger' : 'slash-command-trigger';
  const composer = useComposer(instance?.instance.pluginId === pluginId ? undefined : kind);
  return (item: T, insertion: string) => {
    if (!insertion) throw new Error('AGENT_UI_INVALID_REQUEST_SELECTION');
    // Optional top-level fields may be explicitly undefined in a source result.
    const raw = snapshotAgentUIContext(Object.fromEntries(Object.entries(item as Record<string, unknown>)
      .filter(([, value]) => value !== undefined))) as ComposerData;
    composer.setData(raw, {
      reference: { token: insertion, text: insertion, fallbackText: insertion },
    });
    return insertion;
  };
}
export function useMentionRequest() {
  return useRequest<ConversationMentionItem>('mention');
}
export function useCommandRequest() {
  return useRequest<ConversationCommandRequestItem>('command');
}
export function commandRequestItem(input: ConversationCommandRequestItem): ConversationCommandRequestItem {
  return command(input); // Never snapshot the action's execute function.
}
