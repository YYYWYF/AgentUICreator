import type { ComponentProps, ReactNode } from "react";
import { ConversationComposerCommandTrigger, useAgentUILocale } from "../../../../public.js";
export type ConversationSlashCommandTriggerProps = Omit<ComponentProps<typeof ConversationComposerCommandTrigger>, "labels"> & { labels?: Partial<ComponentProps<typeof ConversationComposerCommandTrigger>["labels"]>; renderSlot?: (name:string, fallback?:ReactNode)=>ReactNode };
export function CanonicalConversationSlashCommandTrigger({labels,...props}: ConversationSlashCommandTriggerProps) { const messages=useAgentUILocale("conversationTriggers");return <ConversationComposerCommandTrigger {...props} labels={{...messages,...labels}} />; }
