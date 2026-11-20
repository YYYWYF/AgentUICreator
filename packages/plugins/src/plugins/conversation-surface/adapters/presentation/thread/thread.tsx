'use client';

import { useTransientMessages } from '../../../../../internal/conversation-transient-messages.js';
import { ComposerHostConfigContext } from '../../../../../internal/composer-input-host-context.js';
import { ToolFallback } from '../../../../../internal/adapters-generated/assistant-ui/components/assistant-ui/elements/tool-fallback.aui.js';
import { useAuiState } from '@assistant-ui/react';
import { type ComponentType, type FC } from 'react';
import { ConversationToolRendererContext } from '../../../../../internal/tool-renderer-context.js';
import { TaskDisclosureProvider } from '../../../../../internal/task-disclosure-context.js';
import { type ThreadProps, EMPTY_COMPONENTS, ThreadComponentsContext } from './thread-context.js';
import { isNewChatView } from './thread-view-state.js';
import { ThreadRoot } from './thread-layout.js';

export const ComposableThread: FC<ThreadProps> = ({
  components = EMPTY_COMPONENTS,
  autoFocus = true,
  composer = null,
}) => {
  const transientMessages = useTransientMessages((messages) => messages);
  const isEmpty = useAuiState(isNewChatView) && !(components.TransientMessages && transientMessages.length > 0);
  const threadId = useAuiState((s) => s.threads.mainThreadId);

  return (
    <ConversationToolRendererContext.Provider
      value={
        components.ToolFallback as
          | ComponentType<import('../../../../../internal/tool-renderer-context.js').ConversationDefaultToolProps>
          | undefined
      }
    >
      <ThreadComponentsContext.Provider value={components}>
        <ComposerHostConfigContext.Provider value={{ autoFocus }}>
          <TaskDisclosureProvider key={threadId}>
            <ThreadRoot isEmpty={isEmpty} composer={composer} />
          </TaskDisclosureProvider>
        </ComposerHostConfigContext.Provider>
      </ThreadComponentsContext.Provider>
    </ConversationToolRendererContext.Provider>
  );
};
