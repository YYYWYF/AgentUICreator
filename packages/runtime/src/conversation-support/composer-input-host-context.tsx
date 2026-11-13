"use client";

import { createContext } from "react";

export const ComposerHostConfigContext = createContext({ autoFocus: false });

/** Presentation shared by the canonical input and its semantic replacements. */
export interface ComposerInputHostConfig {
  variant: "primary" | "message-edit";
  placeholder: string;
  inputAriaLabel: string;
  autoFocus: boolean | undefined;
}

export const ComposerInputHostContext =
  createContext<ComposerInputHostConfig | null>(null);
