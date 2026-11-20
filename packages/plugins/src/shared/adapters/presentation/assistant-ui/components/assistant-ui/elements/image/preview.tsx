'use client';

import { useLocale } from '../../../../../../../locale.js';
import { useState, useEffect, useRef } from 'react';
import { ImageIcon, ImageOffIcon } from 'lucide-react';
import { cn } from '../../../../../../vendor-generated/assistant-ui/lib/utils.js';

export type ImagePreviewProps = Omit<React.ComponentProps<'img'>, 'children'> & {
  containerClassName?: string | undefined;
  ratio?: 'auto' | '1:1' | '4:3' | '16:9' | '9:16' | undefined;
  fit?: 'cover' | 'contain' | undefined;
};

export function ImagePreview({
  className,
  containerClassName,
  ratio = 'auto',
  fit = 'contain',
  onLoad,
  onError,
  alt,
  src,
  ...props
}: ImagePreviewProps) {
  const localeMessages = useLocale();
  alt ??= localeMessages.images.content;
  const imgRef = useRef<HTMLImageElement>(null);
  const [loadedSrc, setLoadedSrc] = useState<string | undefined>(undefined);
  const [errorSrc, setErrorSrc] = useState<string | undefined>(undefined);

  const loaded = loadedSrc === src;
  const error = errorSrc === src;
  const fixedRatio = ratio !== 'auto';
  const ratioClassName =
    ratio === '1:1'
      ? 'aspect-square'
      : ratio === '4:3'
        ? 'aspect-[4/3]'
        : ratio === '16:9'
          ? 'aspect-video'
          : ratio === '9:16'
            ? 'aspect-[9/16]'
            : undefined;

  useEffect(() => {
    const image = imgRef.current;
    if (typeof src !== 'string' || !image?.complete) return;
    if (image.naturalWidth > 0) setLoadedSrc(src);
    else setErrorSrc(src);
  }, [src]);

  return (
    <div
      data-agent-ui-owned=''
      data-slot='image-preview'
      className={cn('relative', fixedRatio ? ratioClassName : !loaded && 'min-h-32', containerClassName)}
    >
      {!loaded && !error && (
        <div
          data-agent-ui-owned=''
          data-slot='image-preview-loading'
          className='bg-muted/50 absolute inset-0 flex items-center justify-center'
        >
          <ImageIcon className='text-muted-foreground size-8 animate-pulse' />
        </div>
      )}
      {error ? (
        <div
          data-agent-ui-owned=''
          data-slot='image-preview-error'
          className={cn('bg-muted/50 flex min-h-32 items-center justify-center p-4', fixedRatio && 'absolute inset-0')}
        >
          <ImageOffIcon className='text-muted-foreground size-8' />
        </div>
      ) : (
        <img
          data-agent-ui-owned=''
          ref={imgRef}
          src={src}
          alt={alt}
          className={cn(
            fixedRatio
              ? cn('block h-full w-full', {
                  'object-cover': fit === 'cover',
                  'object-contain': fit === 'contain',
                })
              : 'block h-auto w-full object-contain',
            !loaded && 'invisible',
            className,
          )}
          onLoad={(e) => {
            if (typeof src === 'string') setLoadedSrc(src);
            onLoad?.(e);
          }}
          onError={(e) => {
            if (typeof src === 'string') setErrorSrc(src);
            onError?.(e);
          }}
          {...props}
        />
      )}
    </div>
  );
}
