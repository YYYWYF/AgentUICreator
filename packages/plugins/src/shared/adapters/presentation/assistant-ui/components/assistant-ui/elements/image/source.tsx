'use client';

import { useLocale } from '../../../../../../../locale.js';
import { useState } from 'react';
import { cn } from '../../../../../../vendor-generated/assistant-ui/lib/utils.js';
import {
  hostOf,
  safeHref,
} from '../../../../../../vendor-generated/assistant-ui/components/assistant-ui/utils/href.js';

export type ImageSourceProps = {
  label?: string | undefined;
  url?: string | undefined;
  iconUrl?: string | undefined;
} & React.ComponentProps<'div'>;

export function ImageSource({ className, label, url, iconUrl, ...props }: ImageSourceProps) {
  const localeMessages = useLocale();
  const href = safeHref(url);
  const host = hostOf(url);
  const displayLabel = label || host;
  const [failedIconUrl, setFailedIconUrl] = useState<string | undefined>();

  if (!displayLabel) return null;

  const showIcon = iconUrl !== undefined && failedIconUrl !== iconUrl;

  return (
    <div
      data-agent-ui-owned=''
      data-slot='image-source'
      className={cn('text-muted-foreground flex items-center gap-2 border-t px-2 py-1.5 text-xs', className)}
      {...props}
    >
      {showIcon ? (
        <img
          data-agent-ui-owned=''
          data-slot='image-source-icon'
          src={iconUrl}
          alt=''
          className='size-4 shrink-0 rounded-sm'
          onError={() => setFailedIconUrl(iconUrl)}
        />
      ) : (
        <span
          data-agent-ui-owned=''
          data-slot='image-source-icon-fallback'
          aria-hidden='true'
          className='bg-muted flex size-4 shrink-0 items-center justify-center rounded-sm text-[10px] font-medium'
        >
          {displayLabel.charAt(0).toUpperCase()}
        </span>
      )}
      {href ? (
        <a
          data-agent-ui-owned=''
          data-slot='image-source-label'
          href={href}
          target='_blank'
          rel='noopener noreferrer'
          className='hover:text-foreground truncate'
        >
          {displayLabel}
          <span data-agent-ui-owned='' className='sr-only'>
            {' '}
            {localeMessages.images.newTab}
          </span>
        </a>
      ) : (
        <span data-agent-ui-owned='' data-slot='image-source-label' className='truncate'>
          {displayLabel}
        </span>
      )}
    </div>
  );
}

export function ImageFilename({ className, children, ...props }: React.ComponentProps<'span'>) {
  if (!children) return null;

  return (
    <span
      data-agent-ui-owned=''
      data-slot='image-filename'
      className={cn('text-muted-foreground block truncate px-2 py-1.5 text-xs', className)}
      {...props}
    >
      {children}
    </span>
  );
}
