import type { ComponentProps, ReactNode } from "react";
export interface ConversationDataSourcePluginProps { renderSlot?: (name:string, fallback?:ReactNode)=>ReactNode; children?: ReactNode; }
export function CanonicalConversationDataSourcePlugin(props: ConversationDataSourcePluginProps) { return <>{props.children ?? null}</>; }
