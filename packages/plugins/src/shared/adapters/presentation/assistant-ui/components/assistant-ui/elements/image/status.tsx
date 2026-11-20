'use client';

import { useLocale } from '../../../../../../../locale.js';
import { Loader2Icon, ShieldAlertIcon } from 'lucide-react';
import { cn } from '../../../../../../vendor-generated/assistant-ui/lib/utils.js';

export function ImageGenerating({ className }: { className?: string }) {
  const localeMessages = useLocale();
  return (
    <div
      data-agent-ui-owned=''
      data-slot='image-generating'
      className={cn('bg-muted/50 flex min-h-32 items-center justify-center p-4', className)}
    >
      <Loader2Icon className='text-muted-foreground size-8 animate-spin' />
      <span data-agent-ui-owned='' className='sr-only'>
        {localeMessages.images.generating}
      </span>
    </div>
  );
}

export function ImageContentFilterError({ className, reason }: { className?: string; reason?: string }) {
  const localeMessages = useLocale();
  return (
    <div
      data-agent-ui-owned=''
      data-slot='image-content-filter-error'
      className={cn('bg-muted/50 flex min-h-32 flex-col items-center justify-center gap-2 p-4 text-center', className)}
    >
      <ShieldAlertIcon className='text-muted-foreground size-8' />
      <p data-agent-ui-owned='' className='text-sm font-medium'>
        {localeMessages.images.generationFailed}
      </p>
      {reason && (
        <p data-agent-ui-owned='' className='text-muted-foreground text-xs'>
          {reason}
        </p>
      )}
    </div>
  );
}
