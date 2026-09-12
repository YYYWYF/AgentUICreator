import { AssistantUiConversationSurface } from "../../../agent-ui/adapters/assistant-ui/conversation";

import { AssistantUiRuntimeDebugOverlay } from "./AssistantUiRuntimeDebugOverlay";

export function AssistantUiConversation() {
  return (
    <AssistantUiConversationSurface>
      {import.meta.env.DEV ? <AssistantUiRuntimeDebugOverlay /> : null}
    </AssistantUiConversationSurface>
  );
}
