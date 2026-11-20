'use client';

import { useLocale } from '../../../../../../../locale.js';
import { useState, useEffect, useCallback, useRef, type PropsWithChildren } from 'react';
import { createPortal } from 'react-dom';
import { XIcon } from 'lucide-react';
import { usePortalContainer } from '../../../../../../style-boundary/AgentUIRoot';

export type ImageZoomProps = PropsWithChildren<{
  src: string;
  alt?: string;
}>;

export function ImageZoom({ src, alt, children }: ImageZoomProps) {
  const localeMessages = useLocale();
  alt ??= localeMessages.images.preview;
  const [isOpen, setIsOpen] = useState(false);
  const portalContainer = usePortalContainer();
  const triggerRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  const handleOpen = useCallback(() => setIsOpen(true), []);
  const handleClose = useCallback(() => {
    setIsOpen(false);
    triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const focusables = overlayRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      const first = focusables?.[0];
      const last = focusables?.[focusables.length - 1];
      if (!first || !last) return;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleClose]);

  useEffect(() => {
    if (!isOpen) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) closeRef.current?.focus();
  }, [isOpen]);

  return (
    <>
      <div
        ref={triggerRef}
        onClick={handleOpen}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            e.currentTarget.click();
          } else if (e.key === ' ') {
            e.preventDefault();
          }
        }}
        onKeyUp={(e) => {
          if (e.key === ' ') e.currentTarget.click();
        }}
        role='button'
        tabIndex={0}
        className='aui-image-zoom-trigger cursor-zoom-in'
        aria-label={localeMessages.images.zoom}
      >
        {children}
      </div>
      {isOpen &&
        portalContainer !== null &&
        createPortal(
          <div
            ref={overlayRef}
            data-slot='image-zoom-overlay'
            role='dialog'
            aria-modal='true'
            className='aui-image-zoom-overlay fade-in animate-in fixed inset-0 z-50 flex items-center justify-center bg-black/80 duration-200'
            onClick={handleClose}
            aria-label={localeMessages.images.zoomed}
          >
            <img
              data-slot='image-zoom-content'
              src={src}
              alt={alt}
              className='aui-image-zoom-content fade-in zoom-in-95 animate-in max-h-[90%] max-w-[90%] cursor-zoom-out object-contain duration-200'
              onClick={(e) => {
                e.stopPropagation();
                handleClose();
              }}
            />
            <button
              data-agent-ui-owned=''
              ref={closeRef}
              type='button'
              aria-label={localeMessages.images.closeZoom}
              onClick={(e) => {
                e.stopPropagation();
                handleClose();
              }}
              className='text-muted-foreground hover:text-foreground bg-background/80 absolute end-4 top-4 cursor-pointer rounded-md p-2'
            >
              <XIcon className='size-5' />
            </button>
          </div>,
          portalContainer ?? document.body,
        )}
    </>
  );
}
