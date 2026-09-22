// @vitest-environment jsdom

import {
  AssistantRuntimeProvider,
  AuiConfig,
  Tools,
  useLocalRuntime,
  type ChatModelAdapter,
} from "@assistant-ui/react";
import { projectLangChainHistory } from "@agent-ui/runtime-conversation";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createConversationSemanticThreadComponents } from "../agent-ui/conversation";
import { ConversationSurface } from "../agent-ui/conversation/ConversationSurface";
import { createConversationToolkit } from "../agent-ui/conversation/toolkit";
import { mockConversationFixtures } from "../dev-mock/conversations/fixtures";

const chatModel: ChatModelAdapter = { run: async () => ({ content: [] }) };
const mountedRoots: Root[] = [];

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

class ResizeObserverMock {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

vi.stubGlobal("ResizeObserver", ResizeObserverMock);
Object.defineProperty(HTMLElement.prototype, "scrollTo", {
  configurable: true,
  value: () => undefined,
});

function HistoryFixture({ conversationId }: { conversationId: string }) {
  const fixture = mockConversationFixtures.find(
    (candidate) => candidate.detail.id === conversationId,
  );
  if (fixture === undefined) throw new Error(`History fixture missing: ${conversationId}`);
  const runtime = useLocalRuntime(chatModel, {
    initialMessages: projectLangChainHistory(
      fixture.detail.state.values.messages ?? [],
    ) as never,
  });
  const config = AuiConfig({
    tools: Tools({ toolkit: createConversationToolkit() }),
  });
  return (
    <AssistantRuntimeProvider config={config} runtime={runtime}>
      <ConversationSurface components={createConversationSemanticThreadComponents()} />
    </AssistantRuntimeProvider>
  );
}

async function renderHistory(conversationId: string): Promise<HTMLDivElement> {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  mountedRoots.push(root);
  await act(async () => {
    root.render(<HistoryFixture conversationId={conversationId} />);
    await Promise.resolve();
  });
  return container;
}

afterEach(async () => {
  await act(async () => {
    for (const root of mountedRoots.splice(0)) root.unmount();
  });
  document.body.replaceChildren();
});

describe("assistant-ui LangGraph history UI integration", () => {
  it("renders a completed persisted tool call without a loading state", async () => {
    const container = await renderHistory("mock-history-tool");

    expect(container.querySelector('[data-slot="tool-call"]')).not.toBeNull();
    expect(container.textContent).not.toContain("Running");
  });

  it("renders reasoning only from the official supported LangChain shape", async () => {
    const container = await renderHistory("mock-history-reasoning");

    expect(container.textContent).toContain(
      "这样 Thread 的身份、消息与只读策略只有一个权威来源。",
    );
  });
});
