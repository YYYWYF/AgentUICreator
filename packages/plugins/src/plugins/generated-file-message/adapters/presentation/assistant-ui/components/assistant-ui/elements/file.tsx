'use client';

import { memo } from 'react';
import type { FileMessagePartComponent } from '@assistant-ui/react';
import { getFileDataKind, getFileHref } from './file/source.js';
import { FilePlayer } from './file/player.js';
import { FileSize, FileRoot, FileIconDisplay, FileName, fileVariants, getMimeTypeIcon } from './file/appearance.js';
import { getDataUrlSize, getBase64Size, formatFileSize } from './file/size.js';
import { FileDownload } from './file/download.js';

const FileImpl: FileMessagePartComponent = ({ filename, data, mimeType, sourceType }) => {
  const kind = getFileDataKind(data, sourceType);
  const showSize = typeof data === 'string' && (kind === 'base64' || kind === 'data-uri');
  const mediaSource = getFileHref(data, mimeType, sourceType);
  const isMedia = mimeType.toLowerCase().startsWith('audio/') || mimeType.toLowerCase().startsWith('video/');

  if (mediaSource && isMedia) {
    return (
      <div data-agent-ui-owned='' className='flex w-full max-w-xl flex-col gap-2'>
        <FilePlayer
          data={data}
          mimeType={mimeType}
          {...(filename !== undefined && { filename })}
          {...(sourceType !== undefined && { sourceType })}
        />
        <div data-agent-ui-owned='' className='flex min-w-0 items-center justify-end gap-2 px-1'>
          {showSize && (
            <FileSize
              bytes={kind === 'data-uri' ? getDataUrlSize(data) : getBase64Size(data)}
              className='text-muted-foreground text-[11px]'
            />
          )}
          <FileDownload
            data={data}
            mimeType={mimeType}
            {...(filename !== undefined && { filename })}
            {...(sourceType !== undefined && { sourceType })}
          />
        </div>
      </div>
    );
  }

  return (
    <FileRoot>
      <FileIconDisplay mimeType={mimeType} />
      <div data-agent-ui-owned='' className='flex min-w-0 flex-1 flex-col gap-0.5'>
        <FileName>{filename}</FileName>
        {showSize && (
          <FileSize bytes={kind === 'data-uri' ? getDataUrlSize(data) : getBase64Size(data)} className='text-xs' />
        )}
      </div>
      <FileDownload
        data={data}
        mimeType={mimeType}
        {...(filename !== undefined && { filename })}
        {...(sourceType !== undefined && { sourceType })}
      />
    </FileRoot>
  );
};

const File = memo(FileImpl) as unknown as FileMessagePartComponent & {
  Root: typeof FileRoot;
  Icon: typeof FileIconDisplay;
  Name: typeof FileName;
  Size: typeof FileSize;
  Download: typeof FileDownload;
  Player: typeof FilePlayer;
};

File.displayName = 'File';

File.Root = FileRoot;

File.Icon = FileIconDisplay;

File.Name = FileName;

File.Size = FileSize;

File.Download = FileDownload;

File.Player = FilePlayer;

export {
  File,
  FileRoot,
  FileIconDisplay,
  FileName,
  FileSize,
  FileDownload,
  FilePlayer,
  fileVariants,
  getMimeTypeIcon,
  getFileDataKind,
  getFileHref,
  getBase64Size,
  formatFileSize,
};

export type { FileDataKind } from './file/source.js';

export type { FileRootProps } from './file/appearance.js';

export type { FilePlayerProps } from './file/player.js';
