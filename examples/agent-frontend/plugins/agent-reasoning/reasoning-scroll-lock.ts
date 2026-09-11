import {
  useCallback,
  useEffect,
  useRef,
  type RefObject,
} from "react";

function numericStyle(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function useReasoningScrollLock<T extends HTMLElement>(
  animatedElementRef: RefObject<T | null>,
  animationDuration: number,
): () => void {
  const scrollContainerRef = useRef<HTMLElement | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => () => cleanupRef.current?.(), []);

  return useCallback(() => {
    cleanupRef.current?.();

    if (scrollContainerRef.current === null) {
      let element: HTMLElement | null = animatedElementRef.current;
      while (element !== null) {
        const { overflowY } = getComputedStyle(element);
        if (overflowY === "auto" || overflowY === "scroll") {
          scrollContainerRef.current = element;
          break;
        }
        element = element.parentElement;
      }
    }

    const scrollContainer = scrollContainerRef.current;
    if (scrollContainer === null) {
      return;
    }

    const scrollPosition = scrollContainer.scrollTop;
    const previousScrollbarWidth = scrollContainer.style.scrollbarWidth;
    const computed = getComputedStyle(scrollContainer);
    const paddingSide = computed.direction === "rtl"
      ? "paddingLeft"
      : "paddingRight";
    const previousPadding = scrollContainer.style[paddingSide];
    const elementScrollbarSize = scrollContainer.offsetWidth
      - scrollContainer.clientWidth
      - numericStyle(computed.borderLeftWidth)
      - numericStyle(computed.borderRightWidth);
    const ownerDocument = scrollContainer.ownerDocument;
    const isRootScroller = scrollContainer === ownerDocument.documentElement
      || scrollContainer === ownerDocument.body;
    const scrollbarSize = isRootScroller && elementScrollbarSize <= 0
      ? (ownerDocument.defaultView?.innerWidth ?? 0)
        - ownerDocument.documentElement.clientWidth
      : elementScrollbarSize;

    scrollContainer.style.scrollbarWidth = "none";
    if (scrollbarSize > 0) {
      scrollContainer.style[paddingSide] = `${
        numericStyle(computed[paddingSide]) + scrollbarSize
      }px`;
    }

    const restoreStyles = () => {
      scrollContainer.style.scrollbarWidth = previousScrollbarWidth;
      scrollContainer.style[paddingSide] = previousPadding;
    };
    const resetPosition = () => {
      scrollContainer.scrollTop = scrollPosition;
    };
    scrollContainer.addEventListener("scroll", resetPosition);

    const timeoutId = window.setTimeout(() => {
      scrollContainer.removeEventListener("scroll", resetPosition);
      restoreStyles();
      cleanupRef.current = null;
    }, animationDuration);

    cleanupRef.current = () => {
      window.clearTimeout(timeoutId);
      scrollContainer.removeEventListener("scroll", resetPosition);
      restoreStyles();
    };
  }, [animatedElementRef, animationDuration]);
}
