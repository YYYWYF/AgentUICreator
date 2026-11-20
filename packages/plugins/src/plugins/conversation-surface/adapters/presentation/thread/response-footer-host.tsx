'use client';

import { cn } from '../../../../../internal/vendor-generated/assistant-ui/lib/utils.js';
import { useAuiState } from '@assistant-ui/react';
import { type ComponentType, type FC } from 'react';
import { resolveConversationTurnGroup } from '../../../../../internal/conversation-turn.js';
import { AssistantResponseRuntimeProvider } from '../../../../../internal/assistant-response-runtime.js';

export const AssistantResponseFooterHost: FC<{
  FooterComponent?: ComponentType | undefined;
}> = ({ FooterComponent }) => {
  const messages = useAuiState((s) => s.thread.messages);
  const messageIndex = useAuiState((s) => s.message.index);
  const turn = resolveConversationTurnGroup(messages, messages[messageIndex]?.id ?? '');
  if (!FooterComponent || !turn || turn.tailAssistantMessageId !== messages[messageIndex]?.id) return null;

  // Product layout policy: reserve the semantic footer's full height in flow.
  // Plugin footers can vary in height, so cancelling a fixed action-bar height
  // would let the next message overlap them. Keep this policy on the host.
  return (
    <AssistantResponseRuntimeProvider key={turn.turnId} group={turn}>
      <div
        data-agent-ui-owned=''
        data-slot='aui_assistant-response-footer'
        className={cn('ms-2 flex items-center', 'min-h-7.5 pt-1.5')}
      >
        <FooterComponent />
      </div>
    </AssistantResponseRuntimeProvider>
  );
};
