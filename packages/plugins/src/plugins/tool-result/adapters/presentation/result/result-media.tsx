import type { ReactNode } from 'react';
import { File, Image, useLocale } from '../../../../../plugin-support.js';
import type {
  ToolMediaResultView,
  ToolResultComponents,
} from '../render-types.js';
import { ResultFile } from './result-file.js';

export function ResultMediaPart({
  part,
  url,
  mimeType,
  filename,
  pending,
  available,
  components,
  index,
}: Omit<ToolMediaResultView, 'defaultView'> & {
  components?: ToolResultComponents | undefined;
}) {
  const messages = useLocale('toolResult');
  if (!available || !url) {
    return (
      <div
        data-agent-ui-owned=""
        data-slot="tool-result-unavailable"
        className="bg-muted/50 text-muted-foreground rounded-xl border p-3 text-sm"
        role="status"
      >
        {filename && (
          <p data-agent-ui-owned="" className="font-medium">
            {filename}
          </p>
        )}
        <p>{pending ? messages.resolving : messages.unavailable}</p>
        {part.source.type === 'file' && (
          <code data-agent-ui-owned="" className="break-all text-xs">
            {part.source.value}
          </code>
        )}
      </div>
    );
  }
  let defaultView: ReactNode;
  if (part.type === 'image') {
    defaultView = (
      <Image
        type="image"
        image={url}
        status={{ type: 'complete' }}
        {...(filename ? { filename } : {})}
      />
    );
  } else if (part.type === 'audio' || part.type === 'video') {
    defaultView = (
      <File.Player
        data={url}
        mimeType={mimeType}
        sourceType="url"
        controlsList="nodownload"
        {...(filename ? { filename } : {})}
      />
    );
  } else
    defaultView = (
      <ResultFile url={url} mimeType={mimeType} filename={filename} />
    );
  const props = {
    src: url,
    mimeType,
    filename,
    pending,
    available,
    index,
    defaultView,
  };
  if (part.type === 'image' && components?.Image) {
    const Component = components.Image;
    return <Component {...props} part={{ ...part, type: 'image' }} />;
  }
  if (part.type === 'audio' && components?.Audio) {
    const Component = components.Audio;
    return <Component {...props} part={{ ...part, type: 'audio' }} />;
  }
  if (part.type === 'video' && components?.Video) {
    const Component = components.Video;
    return <Component {...props} part={{ ...part, type: 'video' }} />;
  }
  if (part.type === 'document' && components?.File) {
    const Component = components.File;
    return <Component {...props} part={{ ...part, type: 'document' }} />;
  }
  return defaultView;
}
