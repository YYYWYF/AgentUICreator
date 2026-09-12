import { Thread } from "@/spikes/assistant-ui/components/assistant-ui/elements/thread.aui.tsx";
import { TooltipProvider } from "@/spikes/assistant-ui/components/ui/tooltip";

import { AssistantUiRuntimeDebugOverlay } from "./AssistantUiRuntimeDebugOverlay";
import { AssistantUiRuntimeProvider } from "./AssistantUiRuntimeProvider";

export function AssistantUiConversation() {
  return (
    <div
      className="assistant-ui-spike dark"
      data-assistant-ui-spike="true"
    >
      <AssistantUiRuntimeProvider>
        <TooltipProvider>
          <Thread autoFocus={false} />
          {import.meta.env.DEV ? <AssistantUiRuntimeDebugOverlay /> : null}
        </TooltipProvider>
      </AssistantUiRuntimeProvider>
    </div>
  );
}
