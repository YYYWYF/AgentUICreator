import type { ReactNode } from 'react';
export interface ThemeProviderPluginProps {
  renderSlot?: (name: string, fallback?: ReactNode) => ReactNode;
}
export function CanonicalThemeProviderPlugin(_props: ThemeProviderPluginProps) {
  return null;
}
