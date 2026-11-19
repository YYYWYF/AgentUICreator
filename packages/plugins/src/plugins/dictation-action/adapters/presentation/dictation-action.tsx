'use client';
import type { ComponentProps, ReactNode } from 'react';
import {
  AuiIf,
  ComposerActions,
  MicIcon,
  SquareIcon,
  TooltipIconButton,
  useAgentUILocale,
} from '../../../../plugin-support.js';
export type ConversationComposerDictateProps = Omit<
  ComponentProps<typeof TooltipIconButton>,
  'tooltip' | 'children'
> & { icon?: ReactNode };
export type ConversationComposerStopDictationProps = Omit<
  ComponentProps<typeof TooltipIconButton>,
  'tooltip' | 'children'
> & { icon?: ReactNode };
export function ConversationComposerDictate({ icon, ...props }: ConversationComposerDictateProps = {}) {
  const messages = useAgentUILocale('composer');
  return (
    <AuiIf condition={(s) => s.thread.capabilities.dictation && s.composer.dictation == null}>
      <ComposerActions.Dictate asChild>
        <TooltipIconButton
          tooltip={messages.voiceInput}
          side='bottom'
          type='button'
          variant='ghost'
          size='icon'
          data-slot='agent-ui-composer-tool'
          className='aui-composer-dictate text-muted-foreground hover:text-foreground size-7 rounded-full'
          aria-label={messages.startVoice}
          {...props}
        >
          {icon ?? <MicIcon data-slot='agent-ui-composer-tool-icon' className='aui-composer-dictate-icon size-4' />}
        </TooltipIconButton>
      </ComposerActions.Dictate>
    </AuiIf>
  );
}
export function ConversationComposerStopDictation({ icon, ...props }: ConversationComposerStopDictationProps = {}) {
  const messages = useAgentUILocale('composer');
  return (
    <AuiIf condition={(s) => s.thread.capabilities.dictation && s.composer.dictation != null}>
      <ComposerActions.StopDictation asChild>
        <TooltipIconButton
          tooltip={messages.stopDictation}
          side='bottom'
          type='button'
          variant='ghost'
          size='icon'
          data-slot='agent-ui-composer-recording-stop'
          className='aui-composer-stop-dictation text-destructive size-7 rounded-full'
          aria-label={messages.stopVoice}
          {...props}
        >
          {icon ?? (
            <SquareIcon
              data-slot='agent-ui-composer-recording-stop-icon'
              className='aui-composer-stop-dictation-icon size-3.5 animate-pulse fill-current'
            />
          )}
        </TooltipIconButton>
      </ComposerActions.StopDictation>
    </AuiIf>
  );
}
export {
  ConversationComposerDictate as ComposerDictateAction,
  ConversationComposerStopDictation as ComposerStopDictationAction,
};
