"use client";

const Primitive = { button: "button" } as const;
function composeEventHandlers<E extends { defaultPrevented: boolean }>(first: ((event: E) => void) | undefined, second: (event: E) => void) {
  return (event: E) => { first?.(event); if (!event.defaultPrevented) second(event); };
}
import {
  type ComponentPropsWithoutRef,
  type ComponentRef,
  forwardRef,
  useCallback,
} from "react";
import { useAui } from "@assistant-ui/react";
import { useSelectionToolbarInfo } from "./quote-selection-root.js";

export namespace SelectionToolbarPrimitiveQuote {
  export type Element = ComponentRef<typeof Primitive.button>;
  export type Props = ComponentPropsWithoutRef<typeof Primitive.button>;
}

/**
 * A button that quotes the currently selected text.
 *
 * Must be placed inside `SelectionToolbarPrimitive.Root`. Reads the
 * selection info from context (captured by the Root), sets it as a
 * quote in the thread composer, and clears the selection.
 *
 * @example
 * ```tsx
 * <SelectionToolbarPrimitive.Quote>
 *   <QuoteIcon /> Quote
 * </SelectionToolbarPrimitive.Quote>
 * ```
 */
export const SelectionToolbarPrimitiveQuote = forwardRef<
  SelectionToolbarPrimitiveQuote.Element,
  SelectionToolbarPrimitiveQuote.Props
>(({ onClick, disabled, ...props }, forwardedRef) => {
  const aui = useAui();
  const info = useSelectionToolbarInfo();

  const handleClick = useCallback(() => {
    if (!info) return;

    aui.thread.composer().setQuote({
      text: info.text,
      messageId: info.messageId,
    });

    window.getSelection()?.removeAllRanges();
  }, [aui, info]);

  return (
    <Primitive.button
      type="button"
      {...props}
      ref={forwardedRef}
      disabled={disabled || !info}
      onClick={composeEventHandlers(onClick, handleClick)}
    />
  );
});

SelectionToolbarPrimitiveQuote.displayName = "SelectionToolbarPrimitive.Quote";
