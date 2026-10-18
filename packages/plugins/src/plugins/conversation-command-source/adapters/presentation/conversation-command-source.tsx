import type { ComponentProps, ReactNode } from "react";
export interface ConversationCommandSourcePluginProps { renderSlot?: (name:string, fallback?:ReactNode)=>ReactNode; children?: ReactNode; }
export function CanonicalConversationCommandSourcePlugin(props: ConversationCommandSourcePluginProps) { return <>{props.children ?? null}</>; }
