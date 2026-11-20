'use client';

import { useTransientMessages } from '../../../../../internal/conversation-transient-messages.js';
import { resolveTransientMessageAnchor } from '../../../../../conversation-transient-message-service.js';
import { QuoteThreadRootContext } from '../../../../../internal/quote-thread-root.js';
import { ThreadFollowupSuggestions } from '../../../../../internal/adapters-generated/assistant-ui/components/assistant-ui/elements/follow-up-suggestions.aui.js';
import { cn } from '../../../../../internal/vendor-generated/assistant-ui/lib/utils.js';
import { AuiIf, ThreadPrimitive, useAuiState } from '@assistant-ui/react';
import { useContext, useMemo, useRef, type FC, type ReactNode } from 'react';
import { ThreadWelcome, ThreadHistorySkeleton, ThreadScrollToBottom, ThreadSuggestions } from './thread-empty-state.js';
import { ThreadComponentsContext } from './thread-context.js';
import { isNewChatView, isHistoryLoadingView } from './thread-view-state.js';
import { AssistantMessage } from './assistant-message.js';
import { CanonicalUserEditComposer } from './message-edit-composer.js';
import { UserMessage } from './user-message.js';

export const ThreadRoot: FC<{
  isEmpty: boolean;
  composer: ReactNode | null;
}> = ({ isEmpty, composer }) => {
  const quoteRootRef = useRef<HTMLDivElement | null>(null);
  const {
    Welcome = ThreadWelcome,
    TransientMessages,
    FollowupSuggestions = ThreadFollowupSuggestions,
  } = useContext(ThreadComponentsContext);
  const transientMessages = useTransientMessages((messages) => messages);
  // Anchors need message identity/order, not the growing contents. Keep the
  // outer viewport/composer from rendering again for every streamed token.
  const messageIdsKey = useAuiState((s) => JSON.stringify(s.thread.messages.map((message) => message.id)));
  const messageIds = useMemo(() => JSON.parse(messageIdsKey) as string[], [messageIdsKey]);
  // A scoped renderer can leave an empty Plugin boundary even when it returns
  // null. Mount only populated anchors so those boundaries cannot double gaps.
  const transientAnchors = new Set(
    transientMessages.map((message) => resolveTransientMessageAnchor(message, messageIds)),
  );

  return (
    <QuoteThreadRootContext.Provider value={quoteRootRef}>
      <ThreadPrimitive.Root
        ref={quoteRootRef}
        className='aui-root aui-thread-root bg-background @container flex h-full flex-col'
        style={{
          ['--thread-max-width' as string]: '44rem',
          ['--composer-bg' as string]: 'var(--color-card)',
          ['--composer-radius' as string]: '1.5rem',
          ['--composer-padding' as string]: '8px',
        }}
      >
        <ThreadPrimitive.Viewport
          turnAnchor='bottom'
          data-slot='aui_thread-viewport'
          className='relative flex flex-1 flex-col overflow-x-auto overflow-y-auto scroll-smooth'
        >
          <div
            data-slot='agent-ui-thread-content'
            className={cn(
              'mx-auto flex w-full max-w-(--thread-max-width) flex-1 flex-col px-4 pt-4',
              isEmpty && 'justify-center',
            )}
          >
            <AuiIf condition={(state) => isEmpty && isNewChatView(state)}>
              <Welcome />
            </AuiIf>
            <AuiIf condition={isHistoryLoadingView}>
              <ThreadHistorySkeleton />
            </AuiIf>

            <div
              data-agent-ui-owned=''
              data-slot='aui_message-group'
              data-agent-ui-message-spacing='turn'
              className='mb-14 flex flex-col gap-y-6 empty:hidden'
            >
              {TransientMessages && transientAnchors.has(null) && <TransientMessages afterMessageId={null} />}
              <ThreadPrimitive.Messages>
                {({ message }) => (
                  <>
                    <ThreadMessage />
                    {TransientMessages && transientAnchors.has(message.id) && (
                      <TransientMessages afterMessageId={message.id} />
                    )}
                  </>
                )}
              </ThreadPrimitive.Messages>
            </div>

            <ThreadPrimitive.ViewportFooter
              className={cn(
                'aui-thread-viewport-footer bg-background flex flex-col gap-4 overflow-visible pb-4 md:pb-6',
                !isEmpty && 'sticky bottom-0 mt-auto rounded-t-(--composer-radius)',
              )}
            >
              <ThreadScrollToBottom />
              <FollowupSuggestions />
              {composer}
              <AuiIf condition={(s) => isEmpty && isNewChatView(s) && s.composer.isEmpty}>
                <ThreadSuggestions />
              </AuiIf>
            </ThreadPrimitive.ViewportFooter>
          </div>
        </ThreadPrimitive.Viewport>
      </ThreadPrimitive.Root>
    </QuoteThreadRootContext.Provider>
  );
};

export const ThreadMessage: FC = () => {
  const {
    AssistantMessage: AssistantMessageComponent = AssistantMessage,
    UserEditComposer = CanonicalUserEditComposer,
  } = useContext(ThreadComponentsContext);
  const role = useAuiState((s) => s.message.role);
  const isEditing = useAuiState((s) => s.message.composer.isEditing);

  if (role === 'system') return null;
  if (isEditing) return <UserEditComposer />;
  if (role === 'user') return <UserMessage />;
  return <AssistantMessageComponent />;
};
