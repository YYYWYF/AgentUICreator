'use client';

import { useLocale } from '../../../../../../../locale.js';
import { type FC } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { FileIcon, FileTextIcon, ImageIcon, MusicIcon, VideoIcon, BracesIcon } from 'lucide-react';
import { cn } from '../../../../../../vendor-generated/assistant-ui/lib/utils.js';
import { formatFileSize } from './size.js';

export const fileVariants = cva('aui-file-root inline-flex items-center gap-3 rounded-lg transition-colors', {
  variants: {
    variant: {
      outline: 'border-border hover:bg-muted/50 border',
      ghost: 'hover:bg-muted/50',
      muted: 'bg-muted/50 hover:bg-muted/70',
    },
    size: {
      sm: 'px-2.5 py-1.5 text-xs',
      default: 'px-3 py-2 text-sm',
      lg: 'px-4 py-3 text-base',
    },
  },
  defaultVariants: {
    variant: 'outline',
    size: 'default',
  },
});

export function getMimeTypeIcon(mimeType: string): FC<{ className?: string }> {
  const type = mimeType.toLowerCase();
  if (type.startsWith('image/')) {
    return ImageIcon;
  }
  if (type === 'application/pdf') {
    return FileTextIcon;
  }
  if (type === 'application/json') {
    return BracesIcon;
  }
  if (type.startsWith('text/')) {
    return FileTextIcon;
  }
  if (type.startsWith('audio/')) {
    return MusicIcon;
  }
  if (type.startsWith('video/')) {
    return VideoIcon;
  }
  return FileIcon;
}

export type FileRootProps = React.ComponentProps<'div'> & VariantProps<typeof fileVariants>;

export function FileRoot({ className, variant, size, children, ...props }: FileRootProps) {
  return (
    <div
      data-agent-ui-owned=''
      data-slot='file-root'
      data-variant={variant}
      data-size={size}
      className={cn(fileVariants({ variant, size, className }))}
      {...props}
    >
      {children}
    </div>
  );
}

export type FileIconDisplayProps = React.ComponentProps<'span'> & {
  mimeType?: string;
};

export function FileIconDisplay({ mimeType, className, children, ...props }: FileIconDisplayProps) {
  const IconComponent = mimeType ? getMimeTypeIcon(mimeType) : FileIcon;

  return (
    <span
      data-agent-ui-owned=''
      data-slot='file-icon'
      className={cn('text-muted-foreground shrink-0', className)}
      {...props}
    >
      {/* eslint-disable-next-line react-hooks/static-components -- The helper only selects module-level icon components. */}
      {children ?? <IconComponent className='size-5' />}
    </span>
  );
}

export function FileName({ className, children, ...props }: React.ComponentProps<'span'>) {
  const messages = useLocale('files');
  return (
    <span
      data-agent-ui-owned=''
      data-slot='file-name'
      className={cn('min-w-0 flex-1 truncate font-medium', className)}
      {...props}
    >
      {children || messages.unnamed}
    </span>
  );
}

export type FileSizeProps = React.ComponentProps<'span'> & {
  bytes: number;
};

export function FileSize({ bytes, className, ...props }: FileSizeProps) {
  return (
    <span
      data-agent-ui-owned=''
      data-slot='file-size'
      className={cn('text-muted-foreground shrink-0', className)}
      {...props}
    >
      {formatFileSize(bytes)}
    </span>
  );
}
