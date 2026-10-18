import { useContext } from "react";
import { ComposerPrimitive, ComposerInputHostContext } from "@za38.03/agent-ui-plugins/composer-support";

export function ComposerTextareaInput() {
  const host = useContext(ComposerInputHostContext);
  if (!host) throw new Error("ComposerTextareaInput requires a canonical Composer input host.");
  return (
    <ComposerPrimitive.Input
      placeholder={host.placeholder}
      className={host.variant === "message-edit"
        ? "aui-edit-composer-input text-foreground min-h-14 w-full resize-none bg-transparent px-4 pt-3 pb-1 text-base outline-none"
        : "aui-composer-input caret-primary placeholder:text-muted-foreground/60 max-h-48 min-h-10 w-full resize-none bg-transparent px-2.5 py-1 text-base leading-6 outline-none"}
      rows={1}
      autoFocus={host.autoFocus}
      enterKeyHint="send"
      aria-label={host.inputAriaLabel}
    />
  );
}
