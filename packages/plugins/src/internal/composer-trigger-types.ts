import type { AgentUILocaleMessages } from "../locale.js";
import type { ConversationMentionTriggerProps as MentionProps, ConversationCommandTriggerProps as CommandProps } from "../public.js";
export type { ConversationMentionItem, ConversationMentionSource, ConversationSlashCommand, ConversationSlashCommandSource } from "../public.js";
export type ConversationTriggerLabels = AgentUILocaleMessages["conversationTriggers"];
export type ConversationMentionTriggerProps = MentionProps & { labels: ConversationTriggerLabels };
export type ConversationCommandTriggerProps = CommandProps & { labels: ConversationTriggerLabels };
