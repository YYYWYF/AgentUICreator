import { useEffect, useState, type ReactNode } from 'react';
import { File, Image, useAgentUILocale } from '../../../../plugin-support.js';
import { ConversationToolFallback, type ConversationToolFallbackProps } from '../../../../public.js';

import { hasToolResultParts, type ToolResultPart, type ToolResultSource } from './content.js';
export type { ToolResultPart, ToolResultSource } from './content.js';
export interface ToolResultContentProps {
  result: unknown;
  resolveFile?: (
    source: Extract<ToolResultSource, { type: 'file' }>,
    options: { signal: AbortSignal },
  ) => string | Promise<string>;
  renderPart?: (part: ToolResultPart, index: number, defaultContent: ReactNode) => ReactNode;
}
function safeMediaUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    return ['http:', 'https:', 'blob:'].includes(url.protocol) ? value : undefined;
  } catch {
    return undefined;
  }
}
function MediaPart({
  part,
  resolveFile,
}: { part: Exclude<ToolResultPart, { type: 'text' }> } & Pick<ToolResultContentProps, 'resolveFile'>) {
  const messages = useAgentUILocale('toolResult');
  const { source } = part;
  const [resolved, setResolved] = useState<{
    key: string;
    url?: string;
    pending: boolean;
    resolver: ToolResultContentProps['resolveFile'];
  }>();
  const key = JSON.stringify(source);
  useEffect(() => {
    if (source.type !== 'file' || !resolveFile) {
      return;
    }
    const controller = new AbortController();
    setResolved({ key, pending: true, resolver: resolveFile });
    Promise.resolve()
      .then(() => resolveFile(source, { signal: controller.signal }))
      .then(
        (value) => {
          if (!controller.signal.aborted) {
            setResolved({ key, pending: false, resolver: resolveFile, ...(safeMediaUrl(value) ? { url: value } : {}) });
          }
        },
        () => {
          if (!controller.signal.aborted) {
            setResolved({ key, pending: false, resolver: resolveFile });
          }
        },
      );
    return () => controller.abort();
  }, [key, resolveFile]);
  const fallbackMime = part.type === 'document' ? 'application/octet-stream' : `${part.type}/*`;
  const mimeType = source.mimeType || fallbackMime;
  const mimeValid = /^[\w.+-]+\/[\w.+*-]+$/u.test(mimeType);
  const dataValid =
    source.type === 'data' &&
    source.value.length > 0 &&
    /^[A-Za-z\d+/\s]*={0,2}$/u.test(source.value) &&
    source.value.replace(/\s/gu, '').length % 4 !== 1;
  const url =
    source.type === 'url'
      ? safeMediaUrl(source.value)
      : source.type === 'data'
        ? mimeValid && dataValid
          ? `data:${mimeType};base64,${source.value}`
          : undefined
        : resolveFile && resolved?.resolver === resolveFile && resolved?.key === key
          ? resolved.url
          : undefined;
  const metadata = part.metadata && typeof part.metadata === 'object' ? (part.metadata as Record<string, unknown>) : {};
  const filename = typeof metadata.filename === 'string' ? metadata.filename : undefined;
  if (!url || !mimeValid || (part.type !== 'document' && !mimeType.startsWith(`${part.type}/`))) {
    const pending =
      source.type === 'file' &&
      resolveFile &&
      (resolved?.key !== key || resolved.resolver !== resolveFile || resolved.pending);
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
export function ConversationToolResultContent({ result, resolveFile, renderPart }: ToolResultContentProps) {
  if (!hasToolResultParts(result)) {
    return <ConversationToolFallback.Result result={result} />;
  }
  return (
    <div data-agent-ui-owned='' data-slot='tool-result-content' className='flex min-w-0 max-w-full flex-col gap-3'>
      {result.map((part, index) => {
        const content =
          part.type === 'text' ? (
            <p data-agent-ui-owned='' className='m-0 whitespace-pre-wrap break-words text-sm'>
              {part.text}
            </p>
          ) : (
            <MediaPart part={part} {...(resolveFile ? { resolveFile } : {})} />
          );
        return (
          <div
            data-agent-ui-owned=''
            key={`${index}:${part.id ?? ''}`}
            data-slot='tool-result-part'
            data-content-type={part.type}
            className='min-w-0 max-w-full'
          >
            {renderPart ? renderPart(part, index, content) : content}
          </div>
        );
      })}
    </div>
  );
}
export interface ConversationToolResultProps
  extends ConversationToolFallbackProps,
    Omit<ToolResultContentProps, 'result'> {
  resultOnly?: boolean;
}
export function ConversationToolResult({
  resolveFile,
  renderPart,
  resultOnly,
  className,
  style,
  id,
  role,
  'aria-label': ariaLabel,
  'aria-describedby': ariaDescription,
  onClick,
  ...tool
}: ConversationToolResultProps) {
  const appearance = {
    className,
    style,
    id,
    role,
    'aria-label': ariaLabel,
    'aria-describedby': ariaDescription,
    onClick,
  };
  const content = (
    <ConversationToolResultContent
      result={tool.result}
      {...(resolveFile ? { resolveFile } : {})}
      {...(renderPart ? { renderPart } : {})}
    />
  );
  if (resultOnly) {
    return <div {...appearance}>{content}</div>;
  }
  if (!hasToolResultParts(tool.result)) {
    return <ConversationToolFallback {...tool} {...appearance} />;
  }
  return (
    <div
      {...appearance}
      data-agent-ui-owned=''
      data-slot='tool-result'
      className={['flex min-w-0 max-w-full flex-col gap-3', className].filter(Boolean).join(' ')}
    >
      <ConversationToolFallback {...tool} renderResult={() => null} />
      {content}
    </div>
  );
}
