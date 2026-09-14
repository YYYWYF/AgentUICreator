import type { ReactNode } from "react";

import {
  ConversationThread,
  type ConversationThreadComponents,
  TooltipProvider,
} from "@agent-ui/react";

export interface ConversationSurfaceProps {
  autoFocus?: boolean;
  children?: ReactNode;
  className?: string;
  components?: ConversationThreadComponents;
  theme?: ConversationTheme;
}

export type ConversationTheme = "light" | "dark";

export function ConversationSurface({
  autoFocus = false,
  children,
  className,
  components,
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
        />
        {children}
      </TooltipProvider>
    </div>
  );
}
