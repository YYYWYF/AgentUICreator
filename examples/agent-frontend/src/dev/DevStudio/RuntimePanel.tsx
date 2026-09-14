import {
  useConversationRuntimeObservation,
} from "@agent-ui/runtime-conversation";

import { useAgentRuntimeSnapshot } from "../../../runtime/context";
import type { AppAgentState } from "../../../agent-contract/agent-state";
import { RuntimePanelView } from "./RuntimePanelView";

export interface RuntimePanelProps {
  endpoint: string | undefined;
  mockEnabled: boolean;
}

export function RuntimePanel({ endpoint, mockEnabled }: RuntimePanelProps) {
  const snapshot = useAgentRuntimeSnapshot<AppAgentState>();
  const conversationObservation = useConversationRuntimeObservation();

  return (
    <RuntimePanelView
      conversationObservation={conversationObservation}
      endpoint={endpoint}
      mockEnabled={mockEnabled}
      snapshot={snapshot}
    />
  );
}
