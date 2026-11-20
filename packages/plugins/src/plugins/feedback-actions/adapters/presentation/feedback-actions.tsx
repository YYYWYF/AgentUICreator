'use client';
import { type ComponentProps, type FC, type ReactNode } from 'react';
import {
  useLocale,
  ActionBarPrimitive,
  AuiIf,
  ThumbsDownIcon,
  ThumbsUpIcon,
  TooltipIconButton,
} from '../../../../plugin-support.js';
export const CanonicalResponseFeedbackActions: FC<{
  likeButtonProps?: Partial<Omit<ComponentProps<typeof TooltipIconButton>, 'tooltip' | 'children'>> & {
    icon?: ReactNode;
  };
  dislikeButtonProps?: Partial<Omit<ComponentProps<typeof TooltipIconButton>, 'tooltip' | 'children'>> & {
    icon?: ReactNode;
  };
}> = ({ likeButtonProps, dislikeButtonProps }) => {
  const { icon: likeIcon, ...likeProps } = likeButtonProps ?? {};
  const { icon: dislikeIcon, ...dislikeProps } = dislikeButtonProps ?? {};
  const { helpful, notHelpful } = useLocale('conversationFeedback');
  return (
    <AuiIf condition={(s) => s.thread.capabilities.feedback}>
      <ActionBarPrimitive.FeedbackPositive asChild>
        <TooltipIconButton
          tooltip={helpful}
          aria-label={helpful}
          type='button'
          className='data-[submitted]:text-primary'
          {...likeProps}
        >
          {likeIcon ?? <ThumbsUpIcon />}
        </TooltipIconButton>
      </ActionBarPrimitive.FeedbackPositive>
      <ActionBarPrimitive.FeedbackNegative asChild>
        <TooltipIconButton
          tooltip={notHelpful}
          aria-label={notHelpful}
          type='button'
          className='data-[submitted]:text-primary'
          {...dislikeProps}
        >
          {dislikeIcon ?? <ThumbsDownIcon />}
        </TooltipIconButton>
      </ActionBarPrimitive.FeedbackNegative>
    </AuiIf>
  );
};

export { CanonicalResponseFeedbackActions as ConversationCanonicalResponseFeedbackActions };
