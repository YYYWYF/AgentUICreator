import type { ReactNode } from "react";

import {
  ConversationThread,
  type ConversationThreadComponents,
  type ConversationThreadLabels,
  TooltipProvider,
} from "@agent-ui/react";

export interface ConversationSurfaceProps {
  autoFocus?: boolean;
  children?: ReactNode;
  className?: string;
  components?: ConversationThreadComponents;
  labels?: ConversationThreadLabels;
  composer?: ReactNode | null;
  theme?: ConversationTheme;
}

export type ConversationTheme = "light" | "dark";

export function ConversationSurface({
  autoFocus = false,
  children,
  className,
  components,
  labels,
  composer = null,
  theme = "light",
}: ConversationSurfaceProps) {
  return (
    <div
      className={[
        "agent-ui-conversation",
        "bg-background",
        theme === "dark" ? "dark" : undefined,
        className,
      ].filter(Boolean).join(" ")}
      data-agent-ui-conversation="true"
      data-theme={theme}
    >
      <TooltipProvider>
        <ConversationThread
          autoFocus={autoFocus}
          components={components}
          labels={labels}
          composer={composer}
        />
        {children}
      </TooltipProvider>
    </div>
  );
}
