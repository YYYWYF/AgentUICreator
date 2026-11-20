'use client';

import { useLocale, formatPresentationMessage } from '../../../../../../../locale.js';
import { DownloadIcon } from 'lucide-react';
import { cn } from '../../../../../../vendor-generated/assistant-ui/lib/utils.js';
import { getFileDataKind, getFileHref } from './source.js';

export type FileDownloadProps = Omit<React.ComponentProps<'a'>, 'href'> & {
  data: string;
  mimeType: string;
  filename?: string;
  sourceType?: 'url' | 'id';
};

export function FileDownload({
  data,
  mimeType,
  filename,
  sourceType,
  className,
  children,
  ...props
}: FileDownloadProps) {
  const messages = useLocale('files');
  if (typeof data !== 'string') return null;
  const kind = getFileDataKind(data, sourceType);
  const href = getFileHref(data, mimeType, sourceType);
  if (!href) return null;

  return (
    <a
      data-agent-ui-owned=''
      data-slot='file-download'
      href={href}
      download={filename || 'download'}
      {...(kind === 'url' && { target: '_blank', rel: 'noopener noreferrer' })}
      className={cn(
        'text-muted-foreground hover:bg-accent hover:text-accent-foreground shrink-0 rounded-md p-1 transition-colors',
        className,
      )}
      aria-label={
        !children ? formatPresentationMessage(messages.download, { filename: filename || messages.unnamed }) : undefined
      }
      {...props}
    >
      {children || <DownloadIcon className='size-4' />}
    </a>
  );
}
