import type { ReactNode } from 'react';

import {
  getAgentUIThemeColorScheme,
  type AgentUITheme,
  ConversationThreadBase as ConversationThread,
  type ConversationThreadComponents,
  TooltipProvider,
} from '../../../../public.js';

export interface ConversationSurfaceProps {
  autoFocus?: boolean | undefined;
  children?: ReactNode;
  className?: string | undefined;
  components?: ConversationThreadComponents | undefined;
  composer?: ReactNode | null;
  theme?: ConversationTheme;
}

export type ConversationTheme = AgentUITheme;

export function ConversationSurface({
  autoFocus = false,
  children,
  className,
  components,
  composer = null,
  theme = 'light',
}: ConversationSurfaceProps) {
  const colorScheme = getAgentUIThemeColorScheme(theme);
  return (
    <div
      className={['agent-ui-conversation', 'bg-background', colorScheme === 'dark' ? 'dark' : undefined, className]
        .filter(Boolean)
        .join(' ')}
      data-agent-ui-conversation='true'
      data-theme={theme}
      data-color-scheme={colorScheme}
    >
      <TooltipProvider>
        <ConversationThread autoFocus={autoFocus} components={components} composer={composer} />
        {children}
      </TooltipProvider>
    </div>
  );
}
