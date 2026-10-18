"use client";
import type { ComponentProps } from "react";
import { ComposerActions, TooltipIconButton, PlusIcon, useAgentUILocale } from "../../../../plugin-support.js";
export type ConversationComposerAddAttachmentProps = Omit<ComponentProps<typeof TooltipIconButton>, "tooltip"> & {
  label?: string; tooltip?: string; actionProps?: Omit<ComponentProps<typeof ComposerActions.AddAttachment>, "children" | "render">;
};
export function ConversationComposerAddAttachment({label, tooltip, actionProps, children, ...props}: ConversationComposerAddAttachmentProps = {}) {
  const messages=useAgentUILocale("composer");label ??= messages.addAttachment;
  return <ComposerActions.AddAttachment {...actionProps} render={<TooltipIconButton tooltip={tooltip ?? label} side="bottom" variant="ghost" size="icon" data-slot="agent-ui-composer-tool" className="aui-composer-add-attachment text-muted-foreground hover:text-foreground hover:bg-muted-foreground/15 dark:border-muted-foreground/15 dark:hover:bg-muted-foreground/30 size-7 rounded-full active:scale-[0.96] motion-reduce:transition-none" aria-label={label} {...props}/>}>{children ?? <PlusIcon data-slot="agent-ui-composer-tool-icon" className="aui-attachment-add-icon size-4" />}</ComposerActions.AddAttachment>;
}
export {ConversationComposerAddAttachment as ComposerAddAttachmentAction};
