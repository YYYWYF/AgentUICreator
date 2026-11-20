'use client';

import type { ImageMessagePart } from '@assistant-ui/react';
import { defaultFilenameFromImage, dataUriToBlob } from './data.js';

export const safeImageDownloadHref = (image: string): string | null => {
  try {
    const url = new URL(image, document.baseURI);
    return url.protocol === 'http:' || url.protocol === 'https:' || url.protocol === 'blob:' ? image : null;
  } catch {
    return null;
  }
};

export const downloadImagePart = (part: Pick<ImageMessagePart, 'image' | 'filename'>): void => {
  if (typeof document === 'undefined') return;
  const filename = part.filename ?? defaultFilenameFromImage(part.image);
  const isDataUri = /^data:/i.test(part.image);
  const blob = isDataUri ? dataUriToBlob(part.image) : null;
  if (isDataUri && !blob) return;
  const objectUrl = blob ? URL.createObjectURL(blob) : null;
  const href = objectUrl ?? safeImageDownloadHref(part.image);
  if (!href) return;
  const a = document.createElement('a');
  a.href = href;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  if (objectUrl) setTimeout(() => URL.revokeObjectURL(objectUrl), 40_000);
};
