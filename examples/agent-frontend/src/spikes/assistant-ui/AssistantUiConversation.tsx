import { AssistantUiConversationSurface } from "../../../agent-ui/adapters/assistant-ui/conversation";

import { AssistantUiRuntimeDebugOverlay } from "./AssistantUiRuntimeDebugOverlay";
import { AssistantUiRuntimeProvider } from "./AssistantUiRuntimeProvider";

export function AssistantUiConversation() {
  return (
    <AssistantUiRuntimeProvider>
      <AssistantUiConversationSurface theme="dark">
        {import.meta.env.DEV ? <AssistantUiRuntimeDebugOverlay /> : null}
      </AssistantUiConversationSurface>
    </AssistantUiRuntimeProvider>
  );
}
