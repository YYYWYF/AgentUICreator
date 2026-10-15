import type { AgentSubscriber } from "@ag-ui/client";
import { describe, expect, it, vi } from "vitest";

import { ConversationApplicationEventSource } from "../src/events/conversation-application-event-source.js";

describe("ConversationApplicationEventSource", () => {
  it("observes CUSTOM once and preserves producer identity", () => {
    let subscriber: AgentSubscriber | undefined;
    const source = new ConversationApplicationEventSource({
      subscribe(next) {
        subscriber = next;
        return { unsubscribe: vi.fn() };
      },
    });
    const listener = vi.fn();
    source.subscribe(listener);
    source.start();
    subscriber?.onCustomEvent?.({
      event: {
        type: "CUSTOM",
        name: "selection.changed",
        value: { id: 1 },
        subagentRunId: "worker-1",
      },
    } as never);
    expect(listener).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledWith({
      name: "selection.changed",
      payload: { id: 1 },
      producer: { type: "subagent", id: "worker-1" },
    });
  });
});
