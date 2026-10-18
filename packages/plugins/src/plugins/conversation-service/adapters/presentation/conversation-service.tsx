import type { ComponentProps, ReactNode } from "react";
export interface ConversationServicePluginProps { renderSlot?: (name:string, fallback?:ReactNode)=>ReactNode; children?: ReactNode; }
export function CanonicalConversationServicePlugin(props: ConversationServicePluginProps) { return <>{props.children ?? null}</>; }
