import type { ReactNode } from 'react';
export interface LocaleProviderPluginProps {
  renderSlot?: (name: string, fallback?: ReactNode) => ReactNode;
}
export function CanonicalLocaleProviderPlugin(_props: LocaleProviderPluginProps) {
  return null;
}
