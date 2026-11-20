'use client';

export const extensionForMimeType = (mimeType?: string): string => {
  switch (mimeType) {
    case 'image/png':
      return 'png';
    case 'image/jpeg':
    case 'image/jpg':
      return 'jpg';
    case 'image/webp':
      return 'webp';
    case 'image/gif':
      return 'gif';
    case 'image/svg+xml':
      return 'svg';
    default:
      return 'png';
  }
};

export const dataUriToBlob = (dataUri: string): Blob | null => {
  const commaIndex = dataUri.indexOf(',');
  const meta = commaIndex >= 0 ? dataUri.slice(0, commaIndex) : dataUri;
  const data = commaIndex >= 0 ? dataUri.slice(commaIndex + 1) : '';
  const mime = meta.match(/data:([^;]+)/i)?.[1]?.toLowerCase() ?? 'application/octet-stream';
  if (!/;base64/i.test(meta)) {
    const parts: BlobPart[] = [];
    let last = 0;
    for (const match of data.matchAll(/(?:%[\da-f]{2})+/gi)) {
      if (match.index > last) parts.push(data.slice(last, match.index));
      const run = match[0];
      const escaped = new Uint8Array(run.length / 3);
      for (let index = 0; index < escaped.length; index++) {
        escaped[index] = Number.parseInt(run.slice(index * 3 + 1, index * 3 + 3), 16);
      }
      parts.push(escaped);
      last = match.index + run.length;
    }
    parts.push(data.slice(last));
    return new Blob(parts, { type: mime });
  }
  let bytes: string;
  try {
    const base64 = data.replace(/%([\da-f]{2})/gi, (_match, hex: string) =>
      String.fromCharCode(Number.parseInt(hex, 16)),
    );
    bytes = atob(base64);
  } catch {
    return null;
  }
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  return new Blob([arr], { type: mime });
};

export const mimeFromImage = (image: string): string | undefined => image.match(/^data:([^;,]+)/i)?.[1]?.toLowerCase();

export const defaultFilenameFromImage = (image: string): string => {
  const mime = mimeFromImage(image);
  if (mime) return `image.${extensionForMimeType(mime)}`;
  try {
    const path = new URL(image, document.baseURI).pathname;
    const encodedBasename = path.split('/').pop() ?? '';
    let basename = encodedBasename;
    try {
      basename = decodeURIComponent(encodedBasename);
    } catch {}
    if (/\.(png|jpe?g|webp|gif|svg)$/i.test(basename)) return basename;
  } catch {}
  return 'image.png';
};
