"use client";

import { useAuiState } from "@assistant-ui/react";
import { CanonicalUserEditComposer } from "./internal/composable-thread.js";
import { useContext } from "react";
import { LexicalComposerInput } from "@assistant-ui/react-lexical";
import { ComposerInputHostContext } from "./internal/composer-input-host-context.js";
import { agentUIDirectiveFormatter, hasUnsupportedConversationDirective, conversationDirectiveDisplayLabel } from "./internal/directive-formatter.js";

export interface ConversationComposerDirectiveChipProps {
  directiveId: string;
  directiveType: string;
  label: string;
}

/** Display only the reference label; the stable identity stays in the directive. */
export function ConversationComposerDirectiveChip({
  directiveId, directiveType, label,
}: Readonly<ConversationComposerDirectiveChipProps>) {
  return (
    <span className="agent-ui-composer-directive-chip" data-slot="composer-directive-chip"
      data-directive-type={directiveType} data-directive-id={directiveId}>
      {conversationDirectiveDisplayLabel(directiveType, label)}
    </span>
  );
}

/** Optional editor presentation. Upstream owns sync, selection and atomic editing. */
export function ConversationComposerLexicalInput() {
  const host = useContext(ComposerInputHostContext);
  if (!host) throw new Error("ConversationComposerLexicalInput requires a canonical Composer input host.");
  return (
    <LexicalComposerInput
      className={host.variant === "message-edit" ? "agent-ui-edit-composer-lexical-input" : "agent-ui-composer-lexical-input"}
      placeholder={host.placeholder}
      aria-label={host.inputAriaLabel}
      autoFocus={host.autoFocus}
      formatter={agentUIDirectiveFormatter}
      directiveChip={ConversationComposerDirectiveChip}
    />
  );
}

/** Rich presentation only; assistant-ui initializes, cancels and sends the edit draft. */
export function ConversationUserEditLexicalComposer() {
  const text = useAuiState(s => s.composer.text);
  return <CanonicalUserEditComposer input={hasUnsupportedConversationDirective(text)
    ? undefined : <ConversationComposerLexicalInput />} />;
}
