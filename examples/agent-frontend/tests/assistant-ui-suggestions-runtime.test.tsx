// @vitest-environment jsdom

import { useAui, type AssistantRuntime } from "@assistant-ui/react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ConversationRuntimeProvider,
  type ConversationAgentFactory,
} from "@agent-ui/runtime-conversation";
import { ConversationSuggestionsPlugin } from "../plugins/conversation-suggestions";
import { createConversationServiceThreadBinding } from "../agent-ui/conversation/threads/conversation-service-thread-binding";

const mountedRoots: Root[] = [];

function createAgent(): ReturnType<ConversationAgentFactory> {
  return {
    threadId: "suggestions-runtime",
    runAgent: vi.fn(),
    abortRun: vi.fn(),
    subscribe: vi.fn(() => ({ unsubscribe: vi.fn() })),
  } as never;
}

function SuggestionRuntimeSurface({
  onRuntime,
}: {
  onRuntime: (runtime: AssistantRuntime) => void;
}) {
  const aui = useAui();
  const runtime = aui.threads.__internal_getAssistantRuntime?.();
  if (runtime === undefined) {
    throw new Error("assistant-ui Runtime was not created");
  }
  onRuntime(runtime);
  return <ConversationSuggestionsPlugin renderSlot={() => null} />;
}

afterEach(() => {
  for (const root of mountedRoots.splice(0)) {
    act(() => root.unmount());
  }
});

describe("Conversation Suggestions Runtime integration", () => {
  it("renders configured suggestions and keeps Trigger behavior in assistant-ui", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    mountedRoots.push(root);
    const binding = createConversationServiceThreadBinding();
    const agent = createAgent();
    let runtime: AssistantRuntime | undefined;

    await act(async () => {
      root.render(
        <ConversationRuntimeProvider
          endpoint="http://example.test/agent"
          threadBinding={binding}
          suggestions={[
            { title: "A", label: "A label", prompt: "Prompt A" },
            { title: "B", label: "B label", prompt: "Prompt B" },
            { title: "C", label: "C label", prompt: "Prompt C" },
          ]}
          unstable_agentFactory={() => agent}
        >
          <SuggestionRuntimeSurface onRuntime={(next) => { runtime = next; }} />
        </ConversationRuntimeProvider>,
      );
      await Promise.resolve();
    });

    expect(container.textContent).toContain("A");
    expect(container.textContent).toContain("B");
    expect(container.textContent).toContain("C");
    const triggers = container.querySelectorAll("button.conversation-suggestion");
    expect(triggers).toHaveLength(3);

    await act(async () => {
      (triggers[0] as HTMLButtonElement).click();
      await Promise.resolve();
    });

    expect(runtime?.thread.getState().messages[0]?.content).toEqual([
      { type: "text", text: "Prompt A" },
    ]);
  });
});
