import type { ReactNode } from "react";

import { Thread } from "../../../vendor/assistant-ui/components/assistant-ui/elements/thread.aui";
import { TooltipProvider } from "../../../vendor/assistant-ui/components/ui/tooltip";

export interface AssistantUiConversationSurfaceProps {
  autoFocus?: boolean;
  children?: ReactNode;
  className?: string;
}

export function AssistantUiConversationSurface({
  autoFocus = false,
  children,
  className,
}: AssistantUiConversationSurfaceProps) {
  return (
    <div
      className={[
        "agent-ui-assistant-ui",
        "dark",
        className,
      ].filter(Boolean).join(" ")}
      data-agent-ui-assistant-ui="true"
      data-theme="dark"
    >
      <TooltipProvider>
        <Thread autoFocus={autoFocus} />
        {children}
      </TooltipProvider>
    </div>
  );
}
