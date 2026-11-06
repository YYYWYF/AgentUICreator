'use client';
import { type ComponentProps, type FC } from 'react';
import {
  useAgentUILocale,
  ActionBarPrimitive,
  AuiIf,
  ThumbsDownIcon,
  ThumbsUpIcon,
  TooltipIconButton,
} from '../../../../plugin-support.js';
export const CanonicalResponseFeedbackActions: FC<{
  likeButtonProps?: Partial<Omit<ComponentProps<typeof TooltipIconButton>, 'tooltip'>>;
  dislikeButtonProps?: Partial<Omit<ComponentProps<typeof TooltipIconButton>, 'tooltip'>>;
}> = ({ likeButtonProps, dislikeButtonProps }) => {
  const { helpful, notHelpful } = useAgentUILocale("conversationFeedback");
  return (
  <AuiIf condition={(s) => s.thread.capabilities.feedback}>
    <ActionBarPrimitive.FeedbackPositive asChild>
      <TooltipIconButton
        tooltip={helpful}
        aria-label={helpful}
        type='button'
        className='data-[submitted]:text-primary'
        {...likeButtonProps}
      >
        {likeButtonProps?.children ?? <ThumbsUpIcon />}
      </TooltipIconButton>
    </ActionBarPrimitive.FeedbackPositive>
    <ActionBarPrimitive.FeedbackNegative asChild>
      <TooltipIconButton
        tooltip={notHelpful}
        aria-label={notHelpful}
        type='button'
        className='data-[submitted]:text-primary'
        {...dislikeButtonProps}
      >
        {dislikeButtonProps?.children ?? <ThumbsDownIcon />}
      </TooltipIconButton>
    </ActionBarPrimitive.FeedbackNegative>
  </AuiIf>
);
};

export { CanonicalResponseFeedbackActions as ConversationCanonicalResponseFeedbackActions };
