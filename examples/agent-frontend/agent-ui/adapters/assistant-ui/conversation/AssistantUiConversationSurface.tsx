import type { ReactNode } from "react";

import {
  Thread,
  type ThreadComponents,
  type ThreadPresentation,
} from "../../../vendor/assistant-ui/components/assistant-ui/elements/thread.aui";
import { TooltipProvider } from "../../../vendor/assistant-ui/components/ui/tooltip";

export interface AssistantUiConversationSurfaceProps {
  autoFocus?: boolean;
  children?: ReactNode;
  className?: string;
  components?: ThreadComponents;
  presentation?: ThreadPresentation;
  theme?: AssistantUiConversationTheme;
}

export type AssistantUiConversationTheme = "light" | "dark";

export function AssistantUiConversationSurface({
  autoFocus = false,
  children,
  className,
  components,
  presentation,
  theme = "light",
}: AssistantUiConversationSurfaceProps) {
  return (
    <div
      className={[
        "agent-ui-assistant-ui",
        theme === "dark" ? "dark" : undefined,
        className,
      ].filter(Boolean).join(" ")}
      data-agent-ui-assistant-ui="true"
      data-theme={theme}
    >
      <TooltipProvider>
        <Thread
          autoFocus={autoFocus}
          components={components}
          presentation={presentation}
        />
        {children}
      </TooltipProvider>
    </div>
  );
}
