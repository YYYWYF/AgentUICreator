"use client";
import type { ComponentProps } from "react";
import { ComposerActions, AuiIf, useAuiState, TooltipIconButton, Button, ArrowUpIcon, SquareIcon, useAgentUILocale, useConversationComposerSendGuard } from "../../../../plugin-support.js";
export type ConversationComposerSendProps = Omit<ComponentProps<typeof TooltipIconButton>, "tooltip"> & {
  label?: string; queueLabel?: string; tooltip?: string;
  actionProps?: Omit<ComponentProps<typeof ComposerActions.Send>, "children" | "asChild">;
};
export type ConversationComposerCancelProps = ComponentProps<typeof Button> & {
  label?: string; actionProps?: Omit<ComponentProps<typeof ComposerActions.Cancel>, "children" | "asChild">;
};
export function ConversationComposerSend({label, queueLabel, tooltip, actionProps, children, ...props}: ConversationComposerSendProps = {}) {
  const messages=useAgentUILocale("composer"); const guardSend=useConversationComposerSendGuard();
  const isRunning=useAuiState(s=>s.thread.isRunning); const actionLabel=isRunning ? queueLabel ?? messages.queueSend : label ?? messages.send;
  return <AuiIf condition={s=>!s.thread.isRunning || s.thread.capabilities.queue}><ComposerActions.Send {...actionProps} asChild onClick={event=>{actionProps?.onClick?.(event); if(guardSend()) event.preventDefault();}}><TooltipIconButton tooltip={tooltip ?? actionLabel} side="bottom" type="button" variant="default" size="icon" className="aui-composer-send size-7 rounded-full" aria-label={actionLabel} {...props}>{children ?? <ArrowUpIcon className="aui-composer-send-icon size-4"/>}</TooltipIconButton></ComposerActions.Send></AuiIf>;
}
export function ConversationComposerCancel({label, actionProps, children, ...props}: ConversationComposerCancelProps = {}) {
  const messages=useAgentUILocale("composer");
  return <AuiIf condition={s=>s.thread.isRunning}><ComposerActions.Cancel {...actionProps} asChild><Button type="button" variant="default" size="icon" className="aui-composer-cancel size-7 rounded-full" aria-label={label ?? messages.stop} {...props}>{children ?? <SquareIcon className="aui-composer-cancel-icon size-2.5 fill-current"/>}</Button></ComposerActions.Cancel></AuiIf>;
}
export {ConversationComposerSend as ComposerSendAction, ConversationComposerCancel as ComposerCancelAction};
