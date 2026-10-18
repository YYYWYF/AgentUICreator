import type { ComponentProps, ReactNode } from "react";
import { ConversationComposerLexicalInput } from "@za38.03/agent-ui-plugins/lexical";
export type ConversationLexicalComposerInputProps = ComponentProps<typeof ConversationComposerLexicalInput> & {renderSlot?: (name:string, fallback?:ReactNode)=>ReactNode;renderScopedSlot?:(name:string,scope:{kind:string;value:unknown},fallback?:ReactNode)=>ReactNode};
export function CanonicalConversationLexicalComposerInput({renderSlot:_,renderScopedSlot:__,...props}: ConversationLexicalComposerInputProps) { return <ConversationComposerLexicalInput {...props} />; }
