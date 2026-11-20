'use client';

export type FileDataKind = 'data-uri' | 'url' | 'base64' | 'id';

export function getFileDataKind(data: string, sourceType?: 'url' | 'id'): FileDataKind {
  if (sourceType === 'url' && /^data:/i.test(data)) return 'data-uri';
  if (sourceType) return sourceType;
  if (/^data:/i.test(data)) return 'data-uri';
  if (/^(https?:\/\/|blob:)/i.test(data)) return 'url';
  return 'base64';
}

export function isUnsafeScheme(data: string): boolean {
  return /^[a-z][a-z\d+.-]*:/i.test(data) && !/^(data:|https?:\/\/|blob:)/i.test(data);
}

export function getFileHref(data: string, mimeType: string, sourceType?: 'url' | 'id'): string | null {
  if (isUnsafeScheme(data)) return null;
  const kind = getFileDataKind(data, sourceType);
  if (kind === 'id') return null;
  if (kind === 'data-uri') return /^data:[^,]*,/i.test(data) ? data : null;
  if (kind === 'url') return /^(https?:\/\/|blob:)/i.test(data) ? data : null;
  return `data:${mimeType};base64,${data}`;
}
