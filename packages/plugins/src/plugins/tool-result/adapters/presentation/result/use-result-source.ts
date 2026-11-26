import { useEffect, useState } from 'react';
import type { ToolResultContentProps } from './result-content.js';
import type { ToolResultPart } from './content.js';

type MediaPart = Exclude<ToolResultPart, { type: 'text' }>;
interface ResolvedSource {
  url?: string;
  pending: boolean;
}
function safeMediaUrl(value: string): string | undefined {
  try {
    return ['http:', 'https:', 'blob:'].includes(new URL(value).protocol)
      ? value
      : undefined;
  } catch {
    return undefined;
  }
}
function sourceKey(part: MediaPart): string {
  return JSON.stringify(part.source);
}

/** Resolve a changing collection without calling Hooks in a variable-length loop. */
export function useResultSources(
  parts: readonly ToolResultPart[],
  resolveFile: ToolResultContentProps['resolveFile'],
) {
  const sources = new Map(
    parts.flatMap((part) =>
      part.type !== 'text' && part.source.type === 'file'
        ? [[sourceKey(part), part.source] as const]
        : [],
    ),
  );
  const signature = JSON.stringify([...sources]);
  const [resolved, setResolved] = useState<{
    signature: string;
    resolver: ToolResultContentProps['resolveFile'];
    values: ReadonlyMap<string, ResolvedSource>;
  }>();
  useEffect(() => {
    if (!resolveFile) return;
    const files = new Map<
      string,
      Extract<MediaPart['source'], { type: 'file' }>
    >(
      JSON.parse(signature) as [
        string,
        Extract<MediaPart['source'], { type: 'file' }>,
      ][],
    );
    if (!files.size) return;
    const controller = new AbortController();
    setResolved({
      signature,
      resolver: resolveFile,
      values: new Map([...files.keys()].map((key) => [key, { pending: true }])),
    });
    for (const [key, source] of files) {
      const finish = (value?: string) => {
        if (controller.signal.aborted) return;
        setResolved((previous) => {
          if (
            !previous ||
            previous.signature !== signature ||
            previous.resolver !== resolveFile
          )
            return previous;
          const values = new Map(previous.values);
          const url = value === undefined ? undefined : safeMediaUrl(value);
          values.set(key, { pending: false, ...(url ? { url } : {}) });
          return { ...previous, values };
        });
      };
      void Promise.resolve()
        .then(() => resolveFile(source, { signal: controller.signal }))
        .then(
          (value) => finish(value),
          () => finish(),
        );
    }
    return () => controller.abort();
  }, [signature, resolveFile]);
  return (part: MediaPart) => {
    const { source } = part;
    const matching =
      resolved?.signature === signature && resolved.resolver === resolveFile;
    const record = matching ? resolved.values.get(sourceKey(part)) : undefined;
    const mimeType =
      source.mimeType ||
      (part.type === 'document'
        ? 'application/octet-stream'
        : `${part.type}/*`);
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
          : resolveFile
            ? record?.url
            : undefined;
    const metadata =
      typeof part.metadata === 'object' && part.metadata !== null
        ? (part.metadata as Record<string, unknown>)
        : {};
    const filename =
      typeof metadata.filename === 'string' ? metadata.filename : undefined;
    const pending = Boolean(
      source.type === 'file' && resolveFile && (!record || record.pending),
    );
    const available = Boolean(
      url &&
        mimeValid &&
        (part.type === 'document' || mimeType.startsWith(`${part.type}/`)),
    );
    return {
      url: available ? url : undefined,
      mimeType,
      filename,
      pending,
      available,
    };
  };
}
