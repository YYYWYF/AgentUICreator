"use client";

import { ComposerPrimitive } from "@assistant-ui/react";
import { createContext, useContext } from "react";

/** Presentation shared by the canonical input and its semantic replacements. */
export interface ComposerInputHostConfig {
  placeholder: string;
  inputAriaLabel: string;
  autoFocus: boolean | undefined;
}

export const ComposerInputHostContext = createContext<ComposerInputHostConfig | null>(null);

/** Slot fallbacks render lazily inside the canonical Composer presentation host. */
export function ComposerTextareaInput() {
  const host = useContext(ComposerInputHostContext);
  if (!host) throw new Error("ComposerTextareaInput requires a canonical Composer input host.");
  return (
    <ComposerPrimitive.Input
      placeholder={host.placeholder}
      className="aui-composer-input caret-primary placeholder:text-muted-foreground/60 max-h-48 min-h-10 w-full resize-none bg-transparent px-2.5 py-1 text-base leading-6 outline-none"
      rows={1}
      autoFocus={host.autoFocus}
      enterKeyHint="send"
      aria-label={host.inputAriaLabel}
    />
  );
}
