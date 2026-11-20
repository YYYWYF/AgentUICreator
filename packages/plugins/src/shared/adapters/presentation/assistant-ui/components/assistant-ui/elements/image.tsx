'use client';

import { useLocale } from '../../../../../../locale.js';
import { memo } from 'react';
import type { ImageMessagePartComponent } from '@assistant-ui/react';
import { ImageRoot, imageVariants } from './image/root.js';
import { ImageGenerating, ImageContentFilterError } from './image/status.js';
import { ImageFilename, ImageSource } from './image/source.js';
import { ImageZoom } from './image/zoom.js';
import { ImagePreview } from './image/preview.js';
import { ImageActions } from './image/actions.js';

const ImageImpl: ImageMessagePartComponent = (props) => {
  const localeMessages = useLocale();
  const { image, filename, status } = props;

  if (status?.type === 'running') {
    return (
      <ImageRoot>
        <ImageGenerating />
        <ImageFilename>{filename}</ImageFilename>
      </ImageRoot>
    );
  }

  if (status?.type === 'incomplete' && status.reason === 'content-filter') {
    return (
      <ImageRoot>
        <ImageContentFilterError reason={localeMessages.images.blocked} />
      </ImageRoot>
    );
  }

  return (
    <ImageRoot>
      <ImageZoom src={image} alt={filename || localeMessages.images.content}>
        <ImagePreview src={image} alt={filename || localeMessages.images.content} />
      </ImageZoom>
      <ImageFilename>{filename}</ImageFilename>
    </ImageRoot>
  );
};

const Image = memo(ImageImpl) as unknown as ImageMessagePartComponent & {
  Root: typeof ImageRoot;
  Preview: typeof ImagePreview;
  Source: typeof ImageSource;
  Filename: typeof ImageFilename;
  Zoom: typeof ImageZoom;
  Actions: typeof ImageActions;
  Generating: typeof ImageGenerating;
  ContentFilterError: typeof ImageContentFilterError;
};

Image.displayName = 'Image';

Image.Root = ImageRoot;

Image.Preview = ImagePreview;

Image.Source = ImageSource;

Image.Filename = ImageFilename;

Image.Zoom = ImageZoom;

Image.Actions = ImageActions;

Image.Generating = ImageGenerating;

Image.ContentFilterError = ImageContentFilterError;

export {
  Image,
  ImageRoot,
  ImagePreview,
  ImageSource,
  ImageFilename,
  ImageZoom,
  ImageActions,
  ImageGenerating,
  ImageContentFilterError,
  imageVariants,
};

export type { ImageRootProps } from './image/root.js';

export type { ImageSourceProps } from './image/source.js';

export type { ImageActionsProps } from './image/actions.js';
