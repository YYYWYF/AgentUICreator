import type { ComponentProps, ReactNode } from "react";
import { ConversationComposerMentionTrigger, useAgentUILocale } from "../../../../public.js";
export type ConversationMentionTriggerPluginProps = Omit<ComponentProps<typeof ConversationComposerMentionTrigger>, "labels"> & { labels?: Partial<ComponentProps<typeof ConversationComposerMentionTrigger>["labels"]>; renderSlot?: (name:string, fallback?:ReactNode)=>ReactNode };
export function CanonicalConversationMentionTrigger({labels,...props}: ConversationMentionTriggerPluginProps) { const messages=useAgentUILocale("conversationTriggers");return <ConversationComposerMentionTrigger {...props} labels={{...messages,...labels}} />; }
