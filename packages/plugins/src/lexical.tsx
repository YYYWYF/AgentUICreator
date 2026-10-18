"use client";

import { useAuiState } from "@assistant-ui/react";
import { CanonicalUserEditComposer } from "./internal/composable-thread.js";
import { useContext, type ComponentProps, type FC, type ReactNode } from "react";
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
export interface ConversationLexicalTriggerItem { readonly id:string;readonly type:string;readonly label:string;readonly description?:string|undefined;readonly metadata?:import("assistant-stream/utils").ReadonlyJSONObject|undefined; }
export type ConversationLexicalSegment={readonly kind:"text";readonly text:string}|{readonly kind:"mention";readonly type:string;readonly label:string;readonly id:string};
export type ConversationLexicalInputProps = Omit<ComponentProps<"div">,"autoFocus"|"children"> & {
  submitMode?:"enter"|"ctrlEnter"|"none"|undefined;cancelOnEscape?:boolean|undefined;placeholder?:string|undefined;autoFocus?:boolean|undefined;
  directivePluginProps?:{onDirectiveSelect?:((item:ConversationLexicalTriggerItem)=>void)|undefined}|undefined;
  directiveChip?:FC<ConversationComposerDirectiveChipProps>|undefined;
  formatter?:{serialize(item:ConversationLexicalTriggerItem):string;parse(text:string):readonly ConversationLexicalSegment[]}|undefined;
  children?:ReactNode|undefined;
};
export function ConversationComposerLexicalInput(props: ConversationLexicalInputProps = {}) {
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
      {...props}
    />
  );
}

/** Rich presentation only; assistant-ui initializes, cancels and sends the edit draft. */
export interface ConversationUserEditLexicalProps {input?:ReactNode;inputProps?:ConversationLexicalInputProps;}
export function ConversationUserEditLexicalComposer({inputProps, input, ...props}: ConversationUserEditLexicalProps = {}) {
  const text = useAuiState(s => s.composer.text);
  return <CanonicalUserEditComposer {...props} input={input ?? (hasUnsupportedConversationDirective(text)
    ? undefined : <ConversationComposerLexicalInput {...inputProps}/>)} />;
}

export { CanonicalConversationLexicalComposerInput } from "./plugins/lexical-composer-input/adapters/presentation/lexical-composer-input.js";
export type { ConversationLexicalComposerInputProps } from "./plugins/lexical-composer-input/adapters/presentation/lexical-composer-input.js";

export { CanonicalConversationLexicalEditComposer } from "./plugins/lexical-edit-composer/adapters/presentation/lexical-edit-composer.js";
export type { ConversationLexicalEditComposerProps } from "./plugins/lexical-edit-composer/adapters/presentation/lexical-edit-composer.js";
