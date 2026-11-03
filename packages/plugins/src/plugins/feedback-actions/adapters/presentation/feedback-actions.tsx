"use client";
import { type FC, type ComponentProps } from "react";
import { TooltipIconButton, AuiIf, ActionBarPrimitive, ThumbsUpIcon, ThumbsDownIcon } from "../../../../plugin-support.js";
export const CanonicalResponseFeedbackActions: FC<{ helpful: string; notHelpful: string; likeButtonProps?: Partial<ComponentProps<typeof TooltipIconButton>>; dislikeButtonProps?: Partial<ComponentProps<typeof TooltipIconButton>> }> = ({ helpful, notHelpful, likeButtonProps, dislikeButtonProps }) => (
  <AuiIf condition={(s) => s.thread.capabilities.feedback}>
    <ActionBarPrimitive.FeedbackPositive asChild>
      <TooltipIconButton tooltip={helpful} aria-label={helpful} type="button" className="data-[submitted]:text-primary" {...likeButtonProps}>
        {likeButtonProps?.children ?? <ThumbsUpIcon />}
      </TooltipIconButton>
    </ActionBarPrimitive.FeedbackPositive>
    <ActionBarPrimitive.FeedbackNegative asChild>
      <TooltipIconButton tooltip={notHelpful} aria-label={notHelpful} type="button" className="data-[submitted]:text-primary" {...dislikeButtonProps}>
        {dislikeButtonProps?.children ?? <ThumbsDownIcon />}
      </TooltipIconButton>
    </ActionBarPrimitive.FeedbackNegative>
  </AuiIf>
);

export { CanonicalResponseFeedbackActions as ConversationCanonicalResponseFeedbackActions };
