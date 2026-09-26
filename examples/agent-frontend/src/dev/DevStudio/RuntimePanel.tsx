import { useEffect, useState } from "react";
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

  const [streamEvents, setStreamEvents] = useState<Array<{ threadId: string; runId: string; type: string; timestamp: number }>>([]);
  useEffect(() => {
    setStreamEvents([]);
    if (!mockEnabled || endpoint === undefined) return;
    const url = new URL(endpoint, window.location.href);
    url.pathname = url.pathname.replace(/\/$/u, "") + "/events";
    url.search = "";
    const controller = new AbortController();
    const refresh = async () => {
      try {
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) return;
        const payload = await response.json() as { events: typeof streamEvents };
        if (!controller.signal.aborted && Array.isArray(payload.events)) setStreamEvents(payload.events);
      } catch { /* The inspector is optional development telemetry. */ }
    };
    void refresh();
    const interval = window.setInterval(() => { void refresh(); }, 1000);
    return () => { controller.abort(); window.clearInterval(interval); };
  }, [endpoint, mockEnabled]);

  return (
    <RuntimePanelView
      conversationObservation={conversationObservation}
      endpoint={endpoint}
      mockEnabled={mockEnabled}
      snapshot={snapshot}
      streamEvents={streamEvents}
    />
  );
}
