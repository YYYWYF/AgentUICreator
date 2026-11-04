import * as React from 'react';
import {
  resolveTransientMessageAnchor,
  useAgentUILocale,
  useAuiState,
  useTransientMessages,
} from '../../../../plugin-support.js';
import type { TransientMessage } from '../../../../public.js';
export interface ConversationTransientMessagesProps extends Omit<React.ComponentProps<'div'>, 'children'> {
  afterMessageId: string | null;
  classNames?: { text?: string };
  styles?: { text?: React.CSSProperties };
  renderMessage?: (message: TransientMessage) => React.ReactNode;
}
/** Standalone display entries: without quote scope, retry, edit or feedback actions. */
export function ConversationTransientMessages({
  afterMessageId,
  classNames,
  styles,
  renderMessage,
  ...rootProps
}: ConversationTransientMessagesProps) {
  const messages = useTransientMessages();
  const messageIds = useAuiState((state) => state.thread.messages);
  const labels = useAgentUILocale('transientMessages');
  const ids = messageIds.map((message) => message.id);
  return (
    <>
      {messages
        .filter((message) => resolveTransientMessageAnchor(message, ids) === afterMessageId)
        .map((message) =>
          renderMessage ? (
            <React.Fragment key={message.id}>{renderMessage(message)}</React.Fragment>
          ) : (
            <div
              key={message.id}
              role={message.type === 'error' ? 'alert' : 'note'}
              aria-label={
                message.type === 'error'
                  ? labels.errorMessage
                  : message.role === 'system'
                    ? labels.systemMessage
                    : message.role === 'user'
                      ? labels.userMessage
                      : labels.assistantMessage
              }
              data-agent-ui-owned=''
              data-slot='transient-message'
              data-transient-message-id={message.id}
              data-transient-message-role={message.role}
              data-transient-message-type={message.type}
              {...rootProps}
              className={[
                message.role === 'system'
                  ? 'flex max-w-full flex-col items-center gap-1'
                  : message.role === 'user'
                    ? 'flex max-w-full flex-col items-end gap-1'
                    : 'flex max-w-full flex-col items-start gap-1',
                rootProps.className,
              ]
                .filter(Boolean)
                .join(' ')}
            >
              <p
                data-slot={
                  message.type === 'error'
                    ? 'agent-ui-message-error'
                    : message.role === 'user'
                      ? 'aui_user-message-content'
                      : undefined
                }
                className={[
                  message.type === 'error'
                    ? 'aui-message-error-root border-destructive bg-destructive/10 text-destructive dark:bg-destructive/5 m-0 max-w-full rounded-md border p-3 text-sm leading-6 whitespace-pre-wrap break-words'
                    : message.role === 'system'
                      ? 'bg-muted/60 text-muted-foreground m-0 max-w-[85%] rounded-full px-3 py-1 text-center text-xs leading-5 whitespace-pre-wrap break-words'
                      : message.role === 'user'
                        ? 'aui-user-message-content bg-muted text-foreground m-0 max-w-[85%] rounded-xl px-4 py-2 whitespace-pre-wrap break-words'
                        : 'bg-muted/50 text-foreground m-0 max-w-full rounded-2xl px-4 py-3 text-sm leading-6 whitespace-pre-wrap break-words',
                  classNames?.text,
                ]
                  .filter(Boolean)
                  .join(' ')}
                style={styles?.text}
              >
                {message.text}
              </p>
            </div>
          ),
        )}
    </>
  );
}
