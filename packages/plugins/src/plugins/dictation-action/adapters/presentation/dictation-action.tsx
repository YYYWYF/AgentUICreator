"use client";
import type { ComponentProps } from "react";
import { ComposerActions, AuiIf, TooltipIconButton, MicIcon, SquareIcon, useAgentUILocale } from "../../../../plugin-support.js";
export type ConversationComposerDictateProps = Omit<ComponentProps<typeof TooltipIconButton>, "tooltip"> & {
  tooltip?: string; ariaLabel?: string; label?: string;
  actionProps?: Omit<ComponentProps<typeof ComposerActions.Dictate>, "children" | "asChild">;
};
export type ConversationComposerStopDictationProps = Omit<ComponentProps<typeof TooltipIconButton>, "tooltip"> & {
  tooltip?: string; ariaLabel?: string; label?: string;
  actionProps?: Omit<ComponentProps<typeof ComposerActions.StopDictation>, "children" | "asChild">;
};
export function ConversationComposerDictate({tooltip, ariaLabel, label, actionProps, children, ...props}: ConversationComposerDictateProps = {}) {
  const messages=useAgentUILocale("composer");
  return <AuiIf condition={s=>s.thread.capabilities.dictation && s.composer.dictation == null}><ComposerActions.Dictate {...actionProps} asChild><TooltipIconButton tooltip={tooltip ?? label ?? messages.voiceInput} side="bottom" type="button" variant="ghost" size="icon" data-slot="agent-ui-composer-tool" className="aui-composer-dictate text-muted-foreground hover:text-foreground size-7 rounded-full" aria-label={ariaLabel ?? label ?? messages.startVoice} {...props}>{children ?? <MicIcon data-slot="agent-ui-composer-tool-icon" className="aui-composer-dictate-icon size-4"/>}</TooltipIconButton></ComposerActions.Dictate></AuiIf>;
}
export function ConversationComposerStopDictation({tooltip, ariaLabel, label, actionProps, children, ...props}: ConversationComposerStopDictationProps = {}) {
  const messages=useAgentUILocale("composer");
  return <AuiIf condition={s=>s.thread.capabilities.dictation && s.composer.dictation != null}><ComposerActions.StopDictation {...actionProps} asChild><TooltipIconButton tooltip={tooltip ?? label ?? messages.stopDictation} side="bottom" type="button" variant="ghost" size="icon" data-slot="agent-ui-composer-recording-stop" className="aui-composer-stop-dictation text-destructive size-7 rounded-full" aria-label={ariaLabel ?? label ?? messages.stopVoice} {...props}>{children ?? <SquareIcon data-slot="agent-ui-composer-recording-stop-icon" className="aui-composer-stop-dictation-icon size-3.5 animate-pulse fill-current"/>}</TooltipIconButton></ComposerActions.StopDictation></AuiIf>;
}
export {ConversationComposerDictate as ComposerDictateAction, ConversationComposerStopDictation as ComposerStopDictationAction};
