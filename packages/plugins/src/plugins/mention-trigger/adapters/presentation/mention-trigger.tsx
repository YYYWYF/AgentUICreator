import type { ComponentProps, ReactNode } from 'react';
import { ConversationComposerMentionTrigger } from '../../../../public.js';
export type ConversationMentionTriggerPluginProps = ComponentProps<typeof ConversationComposerMentionTrigger> & {
  renderSlot?: (name: string, fallback?: ReactNode) => ReactNode;
};
export function CanonicalConversationMentionTrigger(props: ConversationMentionTriggerPluginProps) {
  return <ConversationComposerMentionTrigger {...props} />;
}
