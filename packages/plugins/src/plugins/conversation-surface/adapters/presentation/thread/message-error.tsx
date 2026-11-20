'use client';

import { ErrorPrimitive, MessagePrimitive } from '@assistant-ui/react';
import { type FC } from 'react';

export const MessageError: FC = () => {
  return (
    <MessagePrimitive.Error>
      <ErrorPrimitive.Root
        data-slot='agent-ui-message-error'
        className='aui-message-error-root border-destructive bg-destructive/10 text-destructive dark:bg-destructive/5 mt-2 rounded-md border p-3 text-sm'
      >
        <ErrorPrimitive.Message
          data-slot='agent-ui-message-error-text'
          className='aui-message-error-message line-clamp-2'
        />
      </ErrorPrimitive.Root>
    </MessagePrimitive.Error>
  );
};
