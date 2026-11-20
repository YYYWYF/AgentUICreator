'use client';
import { useRef, useState, type ComponentProps, type ReactNode } from 'react';
import {
  ArrowUpIcon,
  AuiIf,
  Button,
  cn,
  ComposerActions,
  SquareIcon,
  TooltipIconButton,
  useLocale,
  useAuiState,
  useOptionalAgent,
} from '../../../../plugin-support.js';
import { useComposer } from '../../../../composer-support.js';
export type ConversationComposerSendProps = Omit<ComponentProps<typeof TooltipIconButton>, 'tooltip' | 'children'> & {
  icon?: ReactNode;
} & {
  /** Use this URL for the current send and its continuations. */
  endpoint?: string;
  onSendError?: ((error: Error) => void) | undefined;
};
export type ConversationComposerCancelProps = Omit<ComponentProps<typeof Button>, 'children'> & { icon?: ReactNode };
export function ConversationComposerSend({ endpoint, onSendError, ...props }: ConversationComposerSendProps = {}) {
  return endpoint === undefined ? (
    <CurrentComposerSend {...props} />
  ) : (
    <WorkflowComposerSend {...props} endpoint={endpoint} onSendError={onSendError} />
  );
}
function CurrentComposerSend({ icon, className, disabled, ...props }: ConversationComposerSendProps = {}) {
  const messages = useLocale('composer');
  const composer = useComposer();
  return (
    <AuiIf condition={(s) => !s.thread.isRunning}>
      <ComposerActions.Send
        asChild
        {...(disabled === undefined ? {} : { disabled })}
        onClick={(event) => {
          if (composer.awaitingReply) {
            event.preventDefault();
            composer.send();
          }
        }}
      >
        <TooltipIconButton
          tooltip={messages.send}
          side='bottom'
          type='button'
          variant='default'
          size='icon'
          aria-label={messages.send}
          {...props}
          className={cn('aui-composer-send size-7 rounded-full', className)}
        >
          {icon ?? <ArrowUpIcon className='aui-composer-send-icon size-4' />}
        </TooltipIconButton>
      </ComposerActions.Send>
    </AuiIf>
  );
}
function WorkflowComposerSend({
  endpoint,
  onSendError,
  icon,
  disabled,
  onClick,
  ...props
}: ConversationComposerSendProps) {
  const host = useOptionalAgent();
  const empty = useAuiState((state) => state.composer.isEmpty);
  const running = useAuiState((state) => state.thread.isRunning);
  const canSend = useAuiState((state) => state.composer.canSend);
  const composer = useComposer();
  const unavailable = !host || running || !canSend;
  const messages = useLocale('composer');
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState(false);
  const busy = useRef(false);
  return (
    <>
      <TooltipIconButton
        {...props}
        tooltip={messages.send}
        aria-label={props['aria-label'] ?? messages.send}
        type='button'
        disabled={disabled || empty || sending || unavailable}
        onClick={(event) => {
          onClick?.(event);
          if (event.defaultPrevented || busy.current || unavailable) return;
          if (composer.awaitingReply) { composer.send(); return; }
          busy.current = true;
          setSending(true);
          setFailed(false);
          void host!
            .sendComposer({ endpoint })
            .catch((cause) => {
              setFailed(true);
              onSendError?.(cause instanceof Error ? cause : new Error(String(cause)));
            })
            .finally(() => {
              busy.current = false;
              setSending(false);
            });
        }}
      >
        {icon ?? <ArrowUpIcon className='aui-composer-send-icon size-4' />}
      </TooltipIconButton>
      {failed && <span role='alert'>{messages.agentSendFailed}</span>}
    </>
  );
}
export function ConversationComposerCancel({ icon, className, ...props }: ConversationComposerCancelProps = {}) {
  const messages = useLocale('composer');
  const running = useAuiState((s) => s.thread.isRunning);
  return (
    <AuiIf condition={(s) => s.composer.canCancel}>
      <ComposerActions.Cancel asChild>
        <Button
          type='button'
          variant='default'
          size='icon'
          aria-label={running ? messages.stop : messages.cancelSend}
          {...props}
          className={cn('aui-composer-cancel size-7 rounded-full', className)}
        >
          {icon ?? <SquareIcon className='aui-composer-cancel-icon size-2.5 fill-current' />}
        </Button>
      </ComposerActions.Cancel>
    </AuiIf>
  );
}
export { ConversationComposerCancel as ComposerCancelAction, ConversationComposerSend as ComposerSendAction };
