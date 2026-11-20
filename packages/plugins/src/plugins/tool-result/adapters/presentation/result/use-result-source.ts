import { useEffect, useState } from 'react';
import type { ToolResultContentProps } from './result-content.js';
import type { ToolResultPart } from './content.js';

function safeMediaUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    return ['http:', 'https:', 'blob:'].includes(url.protocol) ? value : undefined;
  } catch {
    return undefined;
  }
}
export function useResultSource(
  part: Exclude<ToolResultPart, { type: 'text' }>,
  resolveFile: ToolResultContentProps['resolveFile'],
) {
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
  const pending =
    source.type === 'file' &&
    resolveFile &&
    (resolved?.key !== key || resolved.resolver !== resolveFile || resolved.pending);
  const available = Boolean(url && mimeValid && (part.type === 'document' || mimeType.startsWith(`${part.type}/`)));
  return { url, mimeType, filename, pending, available };
}
