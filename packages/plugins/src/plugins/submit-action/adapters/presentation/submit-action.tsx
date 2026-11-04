'use client';
import type { ComponentProps } from 'react';
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
} from '../../../../plugin-support.js';
export type ConversationComposerSendProps = Omit<ComponentProps<typeof TooltipIconButton>, 'tooltip'> & {
  label?: string;
  queueLabel?: string;
  tooltip?: string;
};
export type ConversationComposerCancelProps = ComponentProps<typeof Button> & {
  label?: string;
};
export function ConversationComposerSend({
  label,
  queueLabel,
  tooltip,
  children,
  className,
  disabled,
  ...props
}: ConversationComposerSendProps = {}) {
  const messages = useAgentUILocale('composer');
  const guardSend = useConversationComposerSendGuard();
  const isRunning = useAuiState((s) => s.thread.isRunning);
  const actionLabel = isRunning ? (queueLabel ?? messages.queueSend) : (label ?? messages.send);
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
          tooltip={tooltip ?? actionLabel}
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
export function ConversationComposerCancel({
  label,
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
          aria-label={label ?? (running ? messages.stop : messages.cancelSend)}
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
