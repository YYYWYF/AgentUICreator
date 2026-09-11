import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react";

export const THREAD_BOTTOM_THRESHOLD_PX = 24;

export interface ThreadScrollMetrics {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
}

export interface ThreadFollowLatestOptions {
  viewportRef: RefObject<HTMLDivElement | null>;
  contentRef: RefObject<HTMLDivElement | null>;
  resetKey: string;
}

export interface ThreadFollowLatestBinding {
  showScrollToBottom: boolean;
  scrollToBottom(): void;
}

export function getThreadBottomDistance(
  viewport: ThreadScrollMetrics,
): number {
  return Math.max(
    0,
    viewport.scrollHeight - viewport.clientHeight - viewport.scrollTop,
  );
}

export function isThreadNearBottom(
  viewport: ThreadScrollMetrics,
  threshold = THREAD_BOTTOM_THRESHOLD_PX,
): boolean {
  return getThreadBottomDistance(viewport) <= threshold;
}

export function isThreadScrollable(viewport: ThreadScrollMetrics): boolean {
  return viewport.scrollHeight > viewport.clientHeight + 1;
}

function moveViewportToBottom(viewport: HTMLDivElement) {
  viewport.scrollTop = Math.max(
    0,
    viewport.scrollHeight - viewport.clientHeight,
  );
}

export function useThreadFollowLatest({
  viewportRef,
  contentRef,
  resetKey,
}: ThreadFollowLatestOptions): ThreadFollowLatestBinding {
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const followingRef = useRef(true);

  const syncFromViewport = useCallback((viewport: HTMLDivElement) => {
    const atBottom = isThreadNearBottom(viewport);
    followingRef.current = atBottom;
    setShowScrollToBottom(isThreadScrollable(viewport) && !atBottom);
  }, []);

  const scrollToBottom = useCallback(() => {
    const viewport = viewportRef.current;
    if (viewport === null) {
      return;
    }

    followingRef.current = true;
    moveViewportToBottom(viewport);
    setShowScrollToBottom(false);
  }, [viewportRef]);

  useLayoutEffect(() => {
    followingRef.current = true;
    setShowScrollToBottom(false);

    const viewport = viewportRef.current;
    if (viewport !== null) {
      moveViewportToBottom(viewport);
    }
  }, [resetKey, viewportRef]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (viewport === null) {
      return;
    }

    const handleScroll = () => {
      syncFromViewport(viewport);
    };

    viewport.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();

    return () => {
      viewport.removeEventListener("scroll", handleScroll);
    };
  }, [resetKey, viewportRef, syncFromViewport]);

  useEffect(() => {
    const viewport = viewportRef.current;
    const content = contentRef.current;
    if (
      viewport === null ||
      content === null ||
      typeof ResizeObserver === "undefined"
    ) {
      return;
    }

    const observer = new ResizeObserver(() => {
      if (followingRef.current) {
        moveViewportToBottom(viewport);
        setShowScrollToBottom(false);
        return;
      }

      const atBottom = isThreadNearBottom(viewport);
      if (atBottom) {
        followingRef.current = true;
      }
      setShowScrollToBottom(isThreadScrollable(viewport) && !atBottom);
    });

    observer.observe(content);

    return () => {
      observer.disconnect();
    };
  }, [resetKey, viewportRef, contentRef]);

  return {
    showScrollToBottom,
    scrollToBottom,
  };
}
