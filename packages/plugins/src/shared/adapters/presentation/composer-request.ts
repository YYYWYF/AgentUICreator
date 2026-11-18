import { useContext } from 'react';
import { snapshotAgentUIContext, trySerializeAgentUIDirective } from '@za38.03/agent-ui-core';
import { PluginInstanceContext, useComposer, type ComposerData } from '@za38.03/agent-ui-runtime/plugin-api';
import type { ConversationMentionItem, ConversationCommandRequestItem, ConversationTriggerRequestAdapter } from '../../../public.js';

function command(input: ConversationCommandRequestItem): ConversationCommandRequestItem {
  return {
    id: input.id, label: input.label, mode: input.mode,
    ...(input.description === undefined ? {} : { description: input.description }),
    ...(input.disabled === undefined ? {} : { disabled: input.disabled }),
    ...(input.data === undefined ? {} : { data: input.data }),
  };
}
/** Plugin-owned selection decoding and formatting. Runtime only transports JSON. */
function useRequest<T>(kind: 'mention' | 'command', requestAdapter: ConversationTriggerRequestAdapter<T> | undefined) {
  const instance = useContext(PluginInstanceContext);
  const pluginId = kind === 'mention' ? 'mention-trigger' : 'slash-command-trigger';
  const composer = useComposer(instance?.instance.pluginId === pluginId ? undefined : kind);
  return (item: T, label: string, insertion: string, fallbackText: string, keepText = false) => {
    const token = requestAdapter && !keepText ? trySerializeAgentUIDirective({
      type: kind === 'command' ? 'command' : 'user', label, id: `agent-ui-selection-${crypto.randomUUID()}`,
    }) : insertion;
    if (!token) throw new Error('AGENT_UI_INVALID_REQUEST_SELECTION');
    // requestAdapter runs on selection. It cannot assemble or overwrite another Plugin's request.
    // Optional top-level fields may be explicitly undefined in a source result.
    const raw = snapshotAgentUIContext(Object.fromEntries(Object.entries(item as Record<string, unknown>)
      .filter(([, value]) => value !== undefined))) as ComposerData;
    const data = requestAdapter ? requestAdapter(item) : raw;
    composer.setData(data, {
      reference: { token, text: requestAdapter && !keepText ? '' : insertion, fallbackText },
      selection: raw,
      // Preserve the original reference-only wire format unless the application opts into JSON.
      includeInRequest: requestAdapter !== undefined,
    });
    return token;
  };
}
export function useMentionRequest(requestAdapter: ConversationTriggerRequestAdapter<ConversationMentionItem> | undefined) {
  return useRequest('mention', requestAdapter);
}
export function useCommandRequest(requestAdapter: ConversationTriggerRequestAdapter<ConversationCommandRequestItem> | undefined) {
  return useRequest('command', requestAdapter);
}
export function commandRequestItem(input: ConversationCommandRequestItem): ConversationCommandRequestItem {
  return command(input); // Never snapshot the action's execute function.
}
