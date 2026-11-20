import { File, Image, useLocale } from '../../../../../plugin-support.js';
import type { ToolResultContentProps } from './result-content.js';
import type { ToolResultPart } from './content.js';
import { useResultSource } from './use-result-source.js';
import { ResultFile } from './result-file.js';

export function ResultMediaPart({
  part,
  resolveFile,
}: {
  part: Exclude<ToolResultPart, { type: 'text' }>;
} & Pick<ToolResultContentProps, 'resolveFile'>) {
  const messages = useLocale('toolResult');
  const { url, mimeType, filename, pending, available } = useResultSource(part, resolveFile);
  const { source } = part;
  if (!available || !url) {
    return (
      <div
        data-agent-ui-owned=''
        data-slot='tool-result-unavailable'
        className='bg-muted/50 text-muted-foreground rounded-xl border p-3 text-sm'
        role='status'
      >
        {filename && (
          <p data-agent-ui-owned='' className='font-medium'>
            {filename}
          </p>
        )}
        <p>{pending ? messages.resolving : messages.unavailable}</p>
        {source.type === 'file' && (
          <code data-agent-ui-owned='' className='break-all text-xs'>
            {source.value}
          </code>
        )}
      </div>
    );
  }
  if (part.type === 'image') {
    return <Image type='image' image={url} status={{ type: 'complete' }} {...(filename ? { filename } : {})} />;
  }
  if (part.type === 'audio' || part.type === 'video') {
    return (
      <File.Player
        data={url}
        mimeType={mimeType}
        sourceType='url'
        controlsList='nodownload'
        {...(filename ? { filename } : {})}
      />
    );
  }
  return <ResultFile url={url} mimeType={mimeType} filename={filename} />;
}
