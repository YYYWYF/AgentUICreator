import {
  useAssistantUiRuntimeObservation,
} from "@agent-ui/runtime-assistant-ui";

import { useAgentRuntimeSnapshot } from "../../../runtime/context";
import type { AppAgentState } from "../../agent-contract/agent-state";
import { RuntimePanelView } from "./RuntimePanelView";

export interface RuntimePanelProps {
  endpoint: string | undefined;
  mockEnabled: boolean;
}

export function RuntimePanel({ endpoint, mockEnabled }: RuntimePanelProps) {
  const snapshot = useAgentRuntimeSnapshot<AppAgentState>();
  const assistantUiObservation = useAssistantUiRuntimeObservation();

  return (
    <RuntimePanelView
      assistantUiObservation={assistantUiObservation}
      endpoint={endpoint}
      mockEnabled={mockEnabled}
      snapshot={snapshot}
    />
  );
}
