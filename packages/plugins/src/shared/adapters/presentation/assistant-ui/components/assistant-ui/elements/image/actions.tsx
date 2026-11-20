'use client';

import { useLocale } from '../../../../../../../locale.js';
import { useState } from 'react';
import { CopyIcon, DownloadIcon, RefreshCwIcon } from 'lucide-react';
import type { ImageMessagePart } from '@assistant-ui/react';
import { cn } from '../../../../../../vendor-generated/assistant-ui/lib/utils.js';
import { downloadImagePart } from './download.js';
import { copyImagePart } from './copy.js';

export type ImageActionsProps = {
  part: ImageMessagePart;
  /**
   * Wire to your own generation call to show a regenerate button. The button
   * renders only when this is set and the part carries a `prompt`.
   */
  onRegenerate?: () => void | Promise<void>;
  className?: string;
};

export function RegenerateButton({ onRegenerate }: { onRegenerate: () => void | Promise<void> }) {
  const localeMessages = useLocale();
  const [isRegenerating, setIsRegenerating] = useState(false);
  return (
    <button
      data-agent-ui-owned=''
      type='button'
      onClick={async () => {
        setIsRegenerating(true);
        try {
          await onRegenerate();
        } catch {
        } finally {
          setIsRegenerating(false);
        }
      }}
      disabled={isRegenerating}
      data-slot='image-regenerate'
      aria-label={localeMessages.images.regenerate}
      className='hover:bg-muted inline-flex size-7 items-center justify-center rounded disabled:opacity-50'
    >
      <RefreshCwIcon className={cn('size-4', isRegenerating && 'animate-spin')} />
    </button>
  );
}

export function ImageActions({ part, onRegenerate, className }: ImageActionsProps) {
  const localeMessages = useLocale();
  return (
    <div data-agent-ui-owned='' data-slot='image-actions' className={cn('flex items-center gap-1 p-1', className)}>
      <button
        data-agent-ui-owned=''
        type='button'
        onClick={() => downloadImagePart(part)}
        data-slot='image-download'
        aria-label={localeMessages.images.download}
        className='hover:bg-muted inline-flex size-7 items-center justify-center rounded'
      >
        <DownloadIcon className='size-4' />
      </button>
      <button
        data-agent-ui-owned=''
        type='button'
        onClick={() => {
          copyImagePart(part).catch(() => {});
        }}
        data-slot='image-copy'
        aria-label={localeMessages.images.copy}
        className='hover:bg-muted inline-flex size-7 items-center justify-center rounded'
      >
        <CopyIcon className='size-4' />
      </button>
      {onRegenerate && <RegenerateButton onRegenerate={onRegenerate} />}
    </div>
  );
}
