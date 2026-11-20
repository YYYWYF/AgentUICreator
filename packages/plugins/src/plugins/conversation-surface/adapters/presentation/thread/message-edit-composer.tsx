'use client';

import { useLocale } from '../../../../../locale.js';
import {
  ComposerInputHostContext,
  ComposerTextareaInput,
} from '../../../../../internal/composer-input-host-context.js';
import { Button } from '../../../../../internal/adapters-generated/assistant-ui/components/ui/button.js';
import { ComposerPrimitive, MessagePrimitive } from '@assistant-ui/react';
import { type FC, type ReactNode } from 'react';

export const CanonicalUserEditComposer: FC<{ input?: ReactNode }> = ({ input }) => {
  const labels = useLocale('conversation');
  return (
    <MessagePrimitive.Root
      data-slot='aui_edit-composer-wrapper'
      className='flex flex-col px-2 [contain-intrinsic-size:auto_200px] [content-visibility:auto]'
    >
      <ComposerPrimitive.Unstable_TriggerPopoverRoot>
        <ComposerPrimitive.Root
          data-slot='agent-ui-edit-composer'
          className='aui-edit-composer-root border-foreground/10 focus-within:border-foreground/25 transition-[border-color] ms-auto flex w-full max-w-[85%] cursor-text flex-col rounded-(--composer-radius) border bg-(--composer-bg)'
        >
          <ComposerInputHostContext.Provider
            value={{
              variant: 'message-edit',
              placeholder: labels.editInput,
              inputAriaLabel: labels.editInput,
              autoFocus: true,
            }}
          >
            {input ?? <ComposerTextareaInput />}
          </ComposerInputHostContext.Provider>
          <div className='aui-edit-composer-footer mx-2.5 mb-2.5 flex items-center gap-1.5 self-end'>
            <ComposerPrimitive.Cancel asChild>
              <Button variant='ghost' size='sm' className='h-8 rounded-full px-3.5'>
                {labels.editCancel}
              </Button>
            </ComposerPrimitive.Cancel>
            <ComposerPrimitive.Send asChild>
              <Button size='sm' className='h-8 rounded-full px-3.5'>
                {labels.editUpdate}
              </Button>
            </ComposerPrimitive.Send>
          </div>
        </ComposerPrimitive.Root>
      </ComposerPrimitive.Unstable_TriggerPopoverRoot>
    </MessagePrimitive.Root>
  );
};
