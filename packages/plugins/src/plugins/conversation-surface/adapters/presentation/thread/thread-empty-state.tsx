'use client';

import { useLocale } from '../../../../../locale.js';
import { TooltipIconButton } from '../../../../../internal/adapters-generated/assistant-ui/components/assistant-ui/elements/tooltip-icon-button.js';
import { Button } from '../../../../../internal/adapters-generated/assistant-ui/components/ui/button.js';
import { Skeleton } from '../../../../../internal/adapters-generated/assistant-ui/components/ui/skeleton.js';
import { SuggestionPrimitive, ThreadPrimitive } from '@assistant-ui/react';
import { ArrowDownIcon } from 'lucide-react';
import { type FC } from 'react';

export const ThreadHistorySkeleton: FC = () => {
  const localeMessages = useLocale();
  return (
    <div
      data-agent-ui-owned=''
      data-slot='aui_thread-history-skeleton'
      role='status'
      className='animate-in fade-in fill-mode-both flex flex-col gap-y-6 [animation-delay:150ms] [animation-duration:200ms]'
    >
      <span data-agent-ui-owned='' className='sr-only'>
        {localeMessages.conversation.loading}
      </span>
      <Skeleton className='ml-auto h-9 w-2/5 rounded-xl motion-reduce:animate-none' />
      <div data-agent-ui-owned='' className='flex flex-col gap-y-2'>
        <Skeleton className='h-4 w-11/12 motion-reduce:animate-none' />
        <Skeleton className='h-4 w-4/5 motion-reduce:animate-none' />
        <Skeleton className='h-4 w-3/5 motion-reduce:animate-none' />
      </div>
      <Skeleton className='ml-auto h-9 w-1/3 rounded-xl motion-reduce:animate-none' />
      <div data-agent-ui-owned='' className='flex flex-col gap-y-2'>
        <Skeleton className='h-4 w-10/12 motion-reduce:animate-none' />
        <Skeleton className='h-4 w-2/3 motion-reduce:animate-none' />
      </div>
    </div>
  );
};

export const ThreadScrollToBottom: FC = () => {
  const localeMessages = useLocale();
  return (
    <ThreadPrimitive.ScrollToBottom asChild>
      <TooltipIconButton
        tooltip={localeMessages.conversation.scrollToBottom}
        variant='outline'
        className='aui-thread-scroll-to-bottom dark:border-border dark:bg-background dark:hover:bg-accent absolute -top-12 z-10 self-center rounded-full p-4 disabled:invisible'
      >
        <ArrowDownIcon />
      </TooltipIconButton>
    </ThreadPrimitive.ScrollToBottom>
  );
};

export const ThreadWelcome: FC = () => {
  const localeMessages = useLocale();
  return (
    <div className='aui-thread-welcome-root mb-6 flex flex-col items-center px-4 text-center'>
      <h1 className='aui-thread-welcome-message-inner fade-in slide-in-from-bottom-1 animate-in fill-mode-both text-2xl font-medium tracking-tight duration-200'>
        {localeMessages.conversation.welcome}
      </h1>
    </div>
  );
};

export const ThreadSuggestions: FC = () => {
  return (
    <div className='aui-thread-welcome-suggestions flex w-full flex-wrap items-center justify-center gap-2 px-4'>
      <ThreadPrimitive.Suggestions>{() => <ThreadSuggestionItem />}</ThreadPrimitive.Suggestions>
    </div>
  );
};

export const ThreadSuggestionItem: FC = () => {
  return (
    <div className='aui-thread-welcome-suggestion-display fade-in slide-in-from-bottom-2 animate-in fill-mode-both duration-200'>
      <SuggestionPrimitive.Trigger send asChild>
        <Button
          variant='ghost'
          className='aui-thread-welcome-suggestion text-foreground hover:bg-muted border-border/60 h-auto gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-normal whitespace-nowrap transition-colors'
        >
          <SuggestionPrimitive.Title className='aui-thread-welcome-suggestion-text-1' />
          <SuggestionPrimitive.Description className='aui-thread-welcome-suggestion-text-2 empty:hidden' />
        </Button>
      </SuggestionPrimitive.Trigger>
    </div>
  );
};
