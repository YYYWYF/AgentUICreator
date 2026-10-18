import type { ComponentProps, ReactNode } from "react";
import { ConversationUserEditLexicalComposer } from "@za38.03/agent-ui-plugins/lexical";
export type ConversationLexicalEditComposerProps = ComponentProps<typeof ConversationUserEditLexicalComposer> & {renderSlot?: (name:string, fallback?:ReactNode)=>ReactNode;renderScopedSlot?:(name:string,scope:{kind:string;value:unknown},fallback?:ReactNode)=>ReactNode};
export function CanonicalConversationLexicalEditComposer({renderSlot:_,renderScopedSlot:__,...props}: ConversationLexicalEditComposerProps) { return <ConversationUserEditLexicalComposer {...props} />; }
