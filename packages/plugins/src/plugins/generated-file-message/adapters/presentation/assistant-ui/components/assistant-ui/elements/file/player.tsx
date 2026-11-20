'use client';

import { cn } from '../../../../../../vendor-generated/assistant-ui/lib/utils.js';
import { AudioPlayer, VideoPlayer } from '../media-player';
import { getFileHref } from './source.js';

export interface FilePlayerProps extends Omit<React.ComponentProps<'div'>, 'children'> {
  data: string;
  mimeType: string;
  filename?: string | undefined;
  sourceType?: 'url' | 'id' | undefined;
  controlsList?: string | undefined;
}

export function FilePlayer({
  data,
  mimeType,
  filename,
  sourceType,
  controlsList,
  className,
  ...props
}: FilePlayerProps) {
  const src = getFileHref(data, mimeType, sourceType);
  const normalizedMimeType = mimeType.toLowerCase();

  if (!src || (!normalizedMimeType.startsWith('audio/') && !normalizedMimeType.startsWith('video/'))) {
    return null;
  }

  return (
    <div data-agent-ui-owned='' data-slot='file-player' className={cn('w-full', className)} {...props}>
      {normalizedMimeType.startsWith('audio/') ? (
        <AudioPlayer src={src} title={filename} />
      ) : (
        <VideoPlayer src={src} title={filename} controlsList={controlsList} />
      )}
    </div>
  );
}
