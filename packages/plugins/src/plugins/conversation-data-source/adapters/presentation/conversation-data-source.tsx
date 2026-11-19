import type { ReactNode } from 'react';
export interface ConversationDataSourcePluginProps {
  renderSlot?: (name: string, fallback?: ReactNode) => ReactNode;
}
export function CanonicalConversationDataSourcePlugin(_props: ConversationDataSourcePluginProps) {
  return null;
}
