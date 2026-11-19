import type { ReactNode } from 'react';
export interface ConversationServicePluginProps {
  renderSlot?: (name: string, fallback?: ReactNode) => ReactNode;
}
export function CanonicalConversationServicePlugin(_props: ConversationServicePluginProps) {
  return null;
}
