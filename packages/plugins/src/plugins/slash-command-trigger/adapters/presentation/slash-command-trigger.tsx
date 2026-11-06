import type { ComponentProps, ReactNode } from 'react';
import { ConversationComposerCommandTrigger } from '../../../../public.js';
export type ConversationSlashCommandTriggerProps = ComponentProps<typeof ConversationComposerCommandTrigger> & {
  renderSlot?: (name: string, fallback?: ReactNode) => ReactNode;
};
export function CanonicalConversationSlashCommandTrigger(props: ConversationSlashCommandTriggerProps) {
  return <ConversationComposerCommandTrigger {...props} />;
}
