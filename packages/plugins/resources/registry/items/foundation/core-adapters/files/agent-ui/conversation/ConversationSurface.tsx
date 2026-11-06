import type { ReactNode } from "react";

import {
  getAgentUIThemeColorScheme,
  type AgentUITheme,
  ConversationThreadBase as ConversationThread,
  type ConversationThreadComponents,
  TooltipProvider,
} from "@za38.03/agent-ui-plugins";

export interface ConversationSurfaceProps {
  autoFocus?: boolean;
  children?: ReactNode;
  className?: string;
  components?: ConversationThreadComponents;
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
  theme = "light",
}: ConversationSurfaceProps) {
  const colorScheme = getAgentUIThemeColorScheme(theme);
  return (
    <div
      className={[
        "agent-ui-conversation",
        "bg-background",
        colorScheme === "dark" ? "dark" : undefined,
        className,
      ].filter(Boolean).join(" ")}
      data-agent-ui-conversation="true"
      data-theme={theme}
      data-color-scheme={colorScheme}
    >
      <TooltipProvider>
        <ConversationThread
          autoFocus={autoFocus}
          components={components}
          composer={composer}
        />
        {children}
      </TooltipProvider>
    </div>
  );
}
