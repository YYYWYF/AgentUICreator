import { File } from '../../../../../plugin-support.js';

export function ResultFile({
  url,
  mimeType,
  filename,
}: {
  url: string;
  mimeType: string;
  filename: string | undefined;
}) {
  return (
    <File
      type='file'
      data={url}
      mimeType={mimeType}
      sourceType='url'
      status={{ type: 'complete' }}
      {...(filename ? { filename } : {})}
    />
  );
}
