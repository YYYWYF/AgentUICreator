'use client';
import { useRef, useState, type ComponentProps } from 'react';
import {
  ArrowUpIcon,
  AuiIf,
  Button,
  cn,
  ComposerActions,
  SquareIcon,
  TooltipIconButton,
  useAgentUILocale,
  useAuiState,
  useConversationComposerSendGuard,
  useOptionalAgentUI,
} from '../../../../plugin-support.js';
export type ConversationComposerSendProps = Omit<ComponentProps<typeof TooltipIconButton>, 'tooltip'> & {
  /** Use this URL for the current send and its continuations. */
  endpoint?: string;
  onSendError?: ((error: Error) => void) | undefined;
};
export type ConversationComposerCancelProps = ComponentProps<typeof Button>;
export function ConversationComposerSend({ endpoint, onSendError, ...props }: ConversationComposerSendProps = {}) {
  return endpoint === undefined ? <CurrentComposerSend {...props} />
    : <WorkflowComposerSend {...props} endpoint={endpoint} onSendError={onSendError} />;
}
function CurrentComposerSend({
  children,
  className,
  disabled,
  ...props
}: ConversationComposerSendProps = {}) {
  const messages = useAgentUILocale('composer');
  const guardSend = useConversationComposerSendGuard();
  const isRunning = useAuiState((s) => s.thread.isRunning);
  const actionLabel = isRunning ? messages.queueSend : messages.send;
  return (
    <AuiIf condition={(s) => !s.thread.isRunning || s.thread.capabilities.queue}>
      <ComposerActions.Send
        asChild
        {...(disabled === undefined ? {} : { disabled })}
        onClick={(event) => {
          if (guardSend()) {
            event.preventDefault();
          }
        }}
      >
        <TooltipIconButton
          tooltip={actionLabel}
          side='bottom'
          type='button'
          variant='default'
          size='icon'
          aria-label={actionLabel}
          {...props}
          className={cn('aui-composer-send size-7 rounded-full', className)}
        >
          {children ?? <ArrowUpIcon className='aui-composer-send-icon size-4' />}
        </TooltipIconButton>
      </ComposerActions.Send>
    </AuiIf>
  );
}
function WorkflowComposerSend({ endpoint, onSendError, children, disabled, onClick, ...props }: ConversationComposerSendProps) {
  const host = useOptionalAgentUI();
  const empty = useAuiState(state => state.composer.isEmpty);
  const running = useAuiState(state => state.thread.isRunning);
  const canSend = useAuiState(state => state.composer.canSend);
  const guardSend = useConversationComposerSendGuard();
  const unavailable = !host || running || !canSend;
  const messages = useAgentUILocale('composer');
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState(false);
  const busy = useRef(false);
  return <>
    <TooltipIconButton {...props} tooltip={messages.send} aria-label={props['aria-label'] ?? messages.send}
      type='button' disabled={disabled || empty || sending || unavailable}
      onClick={event => {
        onClick?.(event);
        if (event.defaultPrevented || busy.current || unavailable || guardSend()) return;
        busy.current = true; setSending(true); setFailed(false);
        void host!.sendComposer({ endpoint }).catch(cause => {
          setFailed(true); onSendError?.(cause instanceof Error ? cause : new Error(String(cause)));
        }).finally(() => { busy.current = false; setSending(false); });
      }}>
      {children ?? <ArrowUpIcon className='aui-composer-send-icon size-4' />}
    </TooltipIconButton>
    {failed && <span role='alert'>{messages.agentSendFailed}</span>}
  </>;
}
export function ConversationComposerCancel({
  children,
  className,
  ...props
}: ConversationComposerCancelProps = {}) {
  const messages = useAgentUILocale('composer');
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
          {children ?? <SquareIcon className='aui-composer-cancel-icon size-2.5 fill-current' />}
        </Button>
      </ComposerActions.Cancel>
    </AuiIf>
  );
}
export { ConversationComposerCancel as ComposerCancelAction, ConversationComposerSend as ComposerSendAction };
