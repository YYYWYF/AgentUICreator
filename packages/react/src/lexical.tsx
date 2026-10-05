"use client";

import { useContext } from "react";
import { LexicalComposerInput } from "@assistant-ui/react-lexical";
import { ComposerInputHostContext } from "./internal/composer-input-host-context.js";
import { agentUIDirectiveFormatter } from "./internal/directive-formatter.js";

export interface ConversationComposerDirectiveChipProps {
  directiveId: string;
  directiveType: string;
  label: string;
}

/** Display only the reference label; the stable identity stays in the directive. */
export function ConversationComposerDirectiveChip({
  directiveId, directiveType, label,
}: Readonly<ConversationComposerDirectiveChipProps>) {
  const prefix = directiveType === "command" ? "/" : "@";
  return (
    <span className="agent-ui-composer-directive-chip"
      data-directive-type={directiveType} data-directive-id={directiveId}>
      {prefix}{label}
    </span>
  );
}

/** Optional editor presentation. Upstream owns sync, selection and atomic editing. */
export function ConversationComposerLexicalInput() {
  const host = useContext(ComposerInputHostContext);
  if (!host) throw new Error("ConversationComposerLexicalInput requires a canonical Composer input host.");
  return (
    <LexicalComposerInput
      className="agent-ui-composer-lexical-input"
      placeholder={host.placeholder}
      aria-label={host.inputAriaLabel}
      autoFocus={host.autoFocus}
      formatter={agentUIDirectiveFormatter}
      directiveChip={ConversationComposerDirectiveChip}
    />
  );
}
