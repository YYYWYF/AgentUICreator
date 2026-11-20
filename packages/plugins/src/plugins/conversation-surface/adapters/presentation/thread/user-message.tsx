'use client';

import { ConversationUserDirectiveText } from '../../../../../internal/conversation-directive-text.js';
import { InternalConversationQuoteBlock } from '../../../../../internal/conversation-quote.js';
import { ConversationMessageSkill } from '../../../../../internal/composer-skill.js';
import { UserMessageAttachments } from '../../../../../internal/adapters-generated/assistant-ui/components/assistant-ui/elements/attachment.aui.js';
import { File } from '../../../../../internal/adapters-generated/assistant-ui/components/assistant-ui/elements/file.js';
import { Image } from '../../../../../internal/adapters-generated/assistant-ui/components/assistant-ui/elements/image.js';
import { MessagePrimitive, type FileMessagePartComponent, type ImageMessagePartComponent } from '@assistant-ui/react';
import { type FC } from 'react';
import { UserActionBar, BranchPicker } from './message-actions.js';

export const UserFilePart: FileMessagePartComponent = (part) => (
  <div data-agent-ui-owned='' data-slot='aui_user-message-file' className='py-1'>
    <File {...part} />
  </div>
);

export const UserImagePart: ImageMessagePartComponent = (part) => (
  <div data-agent-ui-owned='' data-slot='aui_user-message-image' className='py-1'>
    <Image {...part} />
  </div>
);

export const UserMessage: FC = () => {
  return (
    <MessagePrimitive.Root
      data-slot='aui_user-message-root'
      className='fade-in slide-in-from-bottom-1 animate-in grid auto-rows-auto grid-cols-[minmax(72px,1fr)_auto] content-start gap-y-2 px-2 duration-150 [contain-intrinsic-size:auto_200px] [content-visibility:auto] [&:where(>*)]:col-start-2'
      data-role='user'
      data-aui-quote-selectable='false'
    >
      <UserMessageAttachments />
      <ConversationMessageSkill />
      <MessagePrimitive.Quote>
        {(quote) => <InternalConversationQuoteBlock text={quote.text} messageId={quote.messageId} />}
      </MessagePrimitive.Quote>

      <div className='aui-user-message-content-wrapper relative col-start-2 min-w-0'>
        <div
          data-slot='aui_user-message-content'
          className='aui-user-message-content peer bg-muted text-foreground rounded-xl px-4 py-2 wrap-break-word empty:hidden'
        >
          <MessagePrimitive.Parts
            components={{ Text: ConversationUserDirectiveText, File: UserFilePart, Image: UserImagePart }}
          />
        </div>
        <div className='aui-user-action-bar-wrapper absolute start-0 top-1/2 -translate-x-full -translate-y-1/2 pe-2 peer-empty:hidden rtl:translate-x-full'>
          <UserActionBar />
        </div>
      </div>

      <BranchPicker
        data-slot='aui_user-branch-picker'
        className='col-span-full col-start-1 row-start-3 -me-1 justify-end'
      />
    </MessagePrimitive.Root>
  );
};
