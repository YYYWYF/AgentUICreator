'use client';

import type { ImageMessagePart } from '@assistant-ui/react';
import { dataUriToBlob, mimeFromImage } from './data.js';

export const copyImagePart = async (part: Pick<ImageMessagePart, 'image'>): Promise<void> => {
  if (typeof navigator === 'undefined' || !navigator.clipboard || typeof ClipboardItem === 'undefined') {
    throw new Error('Clipboard API is not available in this environment.');
  }
  const blob = /^data:/i.test(part.image) ? dataUriToBlob(part.image) : await fetch(part.image).then((r) => r.blob());
  if (!blob) return;
  const mime = mimeFromImage(part.image) ?? blob.type ?? 'image/png';
  await navigator.clipboard.write([new ClipboardItem({ [mime]: blob })]);
};
