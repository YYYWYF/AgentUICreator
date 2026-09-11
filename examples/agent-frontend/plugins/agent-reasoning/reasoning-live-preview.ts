import { useEffect, type RefObject } from "react";

export const REASONING_BOTTOM_THRESHOLD_PX = 1;

export interface ReasoningPreviewMetrics {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
}

export interface ReasoningLivePreviewOptions {
  textViewportRef: RefObject<HTMLDivElement | null>;
  textContentRef: RefObject<HTMLDivElement | null>;
  streaming: boolean;
  expanded: boolean;
  resetKey: string;
}

export function isReasoningPreviewAtBottom(
  viewport: ReasoningPreviewMetrics,
  threshold = REASONING_BOTTOM_THRESHOLD_PX,
): boolean {
  return viewport.scrollHeight <= viewport.clientHeight
    || Math.abs(
      viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight,
    ) <= threshold;
}

function moveReasoningPreviewToBottom(viewport: HTMLDivElement) {
  viewport.scrollTop = Math.max(
    0,
    viewport.scrollHeight - viewport.clientHeight,
  );
}

export function useReasoningLivePreview({
  textViewportRef,
  textContentRef,
  streaming,
  expanded,
  resetKey,
}: ReasoningLivePreviewOptions): void {
  useEffect(() => {
    if (!streaming || !expanded) {
      return;
    }

    const viewport = textViewportRef.current;
    const content = textContentRef.current;
    if (viewport === null || content === null) {
      return;
    }

    let pinned = true;
    let lastScrollTop = viewport.scrollTop;
    let lastScrollHeight = viewport.scrollHeight;
    const pin = () => {
      if (!pinned) {
        return;
      }
      moveReasoningPreviewToBottom(viewport);
    };
    const handleScroll = () => {
      if (isReasoningPreviewAtBottom(viewport)) {
        pinned = true;
      } else if (
        viewport.scrollTop < lastScrollTop
        && viewport.scrollHeight === lastScrollHeight
      ) {
        pinned = false;
      }
      lastScrollTop = viewport.scrollTop;
      lastScrollHeight = viewport.scrollHeight;
    };

    pin();
    viewport.addEventListener("scroll", handleScroll, { passive: true });
    const observer = typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver(pin);
    observer?.observe(content);

    return () => {
      viewport.removeEventListener("scroll", handleScroll);
      observer?.disconnect();
    };
  }, [expanded, resetKey, streaming, textContentRef, textViewportRef]);
}
