"use client";

import { ComposerPrimitive } from "@assistant-ui/react";
import { createContext, useContext } from "react";

export const ComposerHostConfigContext = createContext({ autoFocus: false });

/** Presentation shared by the canonical input and its semantic replacements. */
export interface ComposerInputHostConfig {
  variant: "primary" | "message-edit";
  placeholder: string;
  inputAriaLabel: string;
  autoFocus: boolean | undefined;
}

export const ComposerInputHostContext = createContext<ComposerInputHostConfig | null>(null);

/** Slot fallbacks render lazily inside the canonical Composer presentation host. */
export { ComposerTextareaInput } from "../plugins/composer/adapters/presentation/textarea.js";
