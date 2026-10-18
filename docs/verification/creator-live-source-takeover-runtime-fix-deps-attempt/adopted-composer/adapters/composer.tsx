"use client";

import { useContext, type FC, type ReactNode } from "react";
import { ComposerPrimitive, QueueItemPrimitive, AuiIf, XIcon, ComposerHostConfigContext, ComposerInputHostContext, ComposerAttachments, TooltipIconButton,
  useConversationComposerAwaitingReply, useConversationComposerSendGuard, useAgentUILocale } from "@za38.03/agent-ui-plugins/composer-support";
import { ComposerTextareaInput } from "./textarea.js";

export interface ComposerQueueLabels {
  queued: string;
  removeQueued: string;
}

export const ComposerQueue: FC<ComposerQueueLabels> = ({ queued, removeQueued }) => (
  <AuiIf condition={(s) => s.thread.capabilities.queue && s.composer.queue.length > 0}>
    <div data-agent-ui-owned="" data-slot="aui_composer-queue" className="border-primary/20 bg-primary/5 flex flex-col gap-1 rounded-lg border p-2">
      <span data-agent-ui-owned="" className="text-muted-foreground text-xs">{queued}</span>
      <ComposerPrimitive.Queue>
        {() => (
          <div data-agent-ui-owned="" data-slot="aui_composer-queue-item" className="flex items-center gap-2 rounded-md bg-background/60 px-2 py-1 text-sm">
            <div data-agent-ui-owned="" className="min-w-0 flex-1 break-words"><QueueItemPrimitive.Text /></div>
            <QueueItemPrimitive.Remove asChild>
              <TooltipIconButton tooltip={removeQueued} aria-label={removeQueued} type="button" className="size-6 shrink-0">
                <XIcon className="size-3.5" />
              </TooltipIconButton>
            </QueueItemPrimitive.Remove>
          </div>
        )}
      </ComposerPrimitive.Queue>
    </div>
  </AuiIf>
);

export interface CanonicalComposerProps {
  autoFocus?: boolean | undefined;
  placeholder: string;
  inputAriaLabel: string;
  queueLabels: ComposerQueueLabels;
  triggers?: ReactNode;
  beforeInput?: ReactNode;
  input?: ReactNode;
  leadingActions?: ReactNode;
  trailingActions?: ReactNode;
  submitAction?: ReactNode;
}

export const CanonicalComposer: FC<CanonicalComposerProps> = ({
  autoFocus,
  placeholder,
  inputAriaLabel,
  queueLabels,
  triggers,
  beforeInput,
  input,
  leadingActions,
  trailingActions,
  submitAction,
}) => {
  const inheritedHostConfig = useContext(ComposerHostConfigContext);
  const resolvedAutoFocus = autoFocus ?? inheritedHostConfig.autoFocus;
  const awaitingReply = useConversationComposerAwaitingReply();
  const guardSend = useConversationComposerSendGuard();

  return (
    <ComposerPrimitive.Unstable_TriggerPopoverRoot>
    <ComposerPrimitive.Root className="aui-composer-root relative flex w-full flex-col"
      onSubmit={event => { if (guardSend()) event.preventDefault(); }}>
      {triggers}
      <ComposerPrimitive.AttachmentDropzone asChild>
        <div data-agent-ui-owned=""
          data-slot="aui_composer-shell"
          className="border-border/60 data-[dragging=true]:border-ring focus-within:border-border dark:border-muted-foreground/15 dark:focus-within:border-muted-foreground/30 flex w-full cursor-text flex-col gap-2 rounded-(--composer-radius) border bg-(--composer-bg) p-(--composer-padding) transition-[border-color] data-[dragging=true]:border-dashed data-[dragging=true]:bg-[color-mix(in_oklab,var(--color-accent)_50%,var(--color-background))]"
        >
          <ComposerAttachments />
          {beforeInput === undefined || beforeInput === null ? null : (
            <div data-agent-ui-owned="" data-slot="aui_composer-before-input">{beforeInput}</div>
          )}
          <ComposerQueue {...queueLabels} />
          {/* Action toolbar rendered above the text input; attachments, beforeInput and queue keep their original order. */}
          <div data-slot="aui_composer-actions" className="aui-composer-action-wrapper relative flex items-center justify-between">
            <div data-agent-ui-owned=""
              data-slot="aui_composer-leading-actions"
              className="flex items-center gap-1.5"
            >
              {leadingActions}
            </div>
            <div data-agent-ui-owned=""
              data-slot="aui_composer-trailing-actions"
              className="flex items-center gap-1.5"
            >
              {trailingActions}
              {submitAction}
            </div>
          </div>
          <ComposerInputHostContext.Provider value={{ variant: "primary", placeholder, inputAriaLabel, autoFocus: resolvedAutoFocus }}>
            <div data-agent-ui-owned="" data-slot="aui_composer-input" className="min-w-0"
              onKeyDownCapture={event => {
                // Only guard the primary input; sibling Slot controls keep their keyboard behavior.
                if (awaitingReply && event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  event.stopPropagation();
                  guardSend();
                }
              }}>
              {input ?? <ComposerTextareaInput />}
            </div>
          </ComposerInputHostContext.Provider>
        </div>
      </ComposerPrimitive.AttachmentDropzone>
    </ComposerPrimitive.Root>
    </ComposerPrimitive.Unstable_TriggerPopoverRoot>
  );
};


export function ConversationCanonicalComposer(props: Omit<CanonicalComposerProps, "placeholder" | "inputAriaLabel" | "queueLabels"> & Partial<Pick<CanonicalComposerProps, "placeholder" | "inputAriaLabel" | "queueLabels">>) {
  const labels = useAgentUILocale("composer");
  return <CanonicalComposer {...props} placeholder={props.placeholder ?? labels.placeholder} inputAriaLabel={props.inputAriaLabel ?? labels.input} queueLabels={props.queueLabels ?? labels} />;
}
export { ComposerTextareaInput as ConversationComposerTextareaInput } from "./textarea.js";
