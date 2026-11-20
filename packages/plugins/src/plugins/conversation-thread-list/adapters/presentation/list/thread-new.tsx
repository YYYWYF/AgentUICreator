'use client';

import { Button } from '../../../../../internal/adapters-generated/assistant-ui/components/ui/button';
import { cn } from '../../../../../internal/vendor-generated/assistant-ui/lib/utils.js';
import { ThreadListPrimitive } from '@assistant-ui/react';
import { PlusIcon } from 'lucide-react';
import { forwardRef, type ComponentPropsWithoutRef } from 'react';

export const ThreadListNew = forwardRef<
  HTMLButtonElement,
  ComponentPropsWithoutRef<typeof Button> & { labelClassName?: string }
>(({ className, labelClassName, children, ...props }, ref) => {
  return (
    <ThreadListPrimitive.New asChild>
      <Button
        data-agent-ui-owned=''
        ref={ref}
        variant='ghost'
        data-slot='aui_thread-list-new'
        className={cn(
          'hover:bg-muted data-active:bg-muted h-8 justify-start gap-2 rounded-md px-2.5 text-sm font-normal',
          className,
        )}
        {...props}
      >
        {children ?? (
          <>
            <PlusIcon data-agent-ui-owned='' data-slot='aui_thread-list-new-icon' className='size-4 shrink-0' />
            <span
              data-agent-ui-owned=''
              data-slot='aui_thread-list-new-label'
              className={cn('whitespace-nowrap', labelClassName)}
            >
              New Thread
            </span>
          </>
        )}
      </Button>
    </ThreadListPrimitive.New>
  );
});

ThreadListNew.displayName = 'ThreadListNew';
