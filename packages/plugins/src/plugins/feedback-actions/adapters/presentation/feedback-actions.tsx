"use client";
import { type FC, type ComponentProps } from "react";
import { TooltipIconButton, AuiIf, ActionBarPrimitive, ThumbsUpIcon, ThumbsDownIcon } from "../../../../plugin-support.js";
export const CanonicalResponseFeedbackActions: FC<{ helpful: string; notHelpful: string; positiveProps?: Partial<ComponentProps<typeof TooltipIconButton>>; negativeProps?: Partial<ComponentProps<typeof TooltipIconButton>> }> = ({ helpful, notHelpful, positiveProps, negativeProps }) => (
  <AuiIf condition={(s) => s.thread.capabilities.feedback}>
    <ActionBarPrimitive.FeedbackPositive asChild>
      <TooltipIconButton tooltip={helpful} aria-label={helpful} type="button" className="data-[submitted]:text-primary" {...positiveProps}>
        {positiveProps?.children ?? <ThumbsUpIcon />}
      </TooltipIconButton>
    </ActionBarPrimitive.FeedbackPositive>
    <ActionBarPrimitive.FeedbackNegative asChild>
      <TooltipIconButton tooltip={notHelpful} aria-label={notHelpful} type="button" className="data-[submitted]:text-primary" {...negativeProps}>
        {negativeProps?.children ?? <ThumbsDownIcon />}
      </TooltipIconButton>
    </ActionBarPrimitive.FeedbackNegative>
  </AuiIf>
);

export { CanonicalResponseFeedbackActions as ConversationCanonicalResponseFeedbackActions };
