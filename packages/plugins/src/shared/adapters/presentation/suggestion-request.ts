import { useContext, useState, type MouseEvent } from 'react';
import { snapshotAgentUIContext } from '@za38.03/agent-ui-core';
import { PluginInstanceContext } from '@za38.03/agent-ui-runtime/plugin-api';
import { ConversationComposerDataContext, useComposer, type ComposerData } from '@za38.03/agent-ui-plugins/composer-support';
import type { ConversationSuggestionRequestItem, ConversationSuggestionRequestAdapter } from '../../../public.js';

/** Native Suggestion primitives still own insertion, disabled state and queueing. */
export function useSuggestionRequest(item: ConversationSuggestionRequestItem,
  requestAdapter: ConversationSuggestionRequestAdapter | undefined, send: boolean,
  clearComposer: boolean | undefined, onClick: ((event: MouseEvent<HTMLButtonElement>) => void) | undefined) {
  const context = useContext(ConversationComposerDataContext);
  const instance = useContext(PluginInstanceContext);
  const composer = useComposer(instance?.instance.pluginId === 'conversation-suggestions' ? undefined : 'suggestions');
  const [failed, setFailed] = useState(false);
  return { failed, onClick: (event: MouseEvent<HTMLButtonElement>) => {
    onClick?.(event);
    if (event.defaultPrevented) return;
    if (!context && !requestAdapter) return; // Preserve standalone assistant-ui presentation.
    try {
      const raw = snapshotAgentUIContext({ item: Object.fromEntries(Object.entries(item).filter(([, value]) => value !== undefined)) })!.item as ComposerData;
      const data = requestAdapter ? requestAdapter(structuredClone(raw) as unknown as ConversationSuggestionRequestItem) : raw;
      snapshotAgentUIContext({ data, raw });
      if (!item.prompt) throw new Error('AGENT_UI_INVALID_COMPOSER_DATA');
      // Replacement suggestions replace this owner's earlier choice, not another Plugin's data.
      if (clearComposer !== false) composer.clearData();
      const release = composer.setData(data, { reference: { token: item.prompt, text: item.prompt, fallbackText: item.prompt },
        selection: raw, includeInRequest: requestAdapter !== undefined });
      setFailed(false);
      if (send) queueMicrotask(release); // Only release this click's entry, preserving later drafts.
    } catch {
      event.preventDefault();
      setFailed(true);
    }
  } };
}
