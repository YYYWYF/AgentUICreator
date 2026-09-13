// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  AssistantRuntimeProvider,
  AuiConfig,
  Tools,
  useLocalRuntime,
  type ChatModelAdapter,
} from "@assistant-ui/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createAssistantUiSemanticThreadComponents } from "../agent-ui/adapters/assistant-ui/conversation";
import { AssistantUiConversationSurface } from "../agent-ui/adapters/assistant-ui/conversation/AssistantUiConversationSurface";
import { createAssistantUiToolkit } from "../agent-ui/adapters/assistant-ui/toolkit";
import { projectConversationReplay } from "../agent-ui/adapters/assistant-ui/threads/conversation-history-projector";
import { mockConversationFixtures } from "../dev-mock/conversations/fixtures";
import type { UIPluginComponentProps } from "../framework/contracts/ui-plugin";

const renderFallback: UIPluginComponentProps["renderSlot"] = (
  _slotId,
  fallback,
) => fallback;
const chatModel: ChatModelAdapter = { run: async () => ({ content: [] }) };
const mountedRoots: Root[] = [];

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

class ResizeObserverMock {
  constructor(_callback: ResizeObserverCallback) {}
  observe(_target: Element): void {}
  unobserve(_target: Element): void {}
  disconnect(): void {}
}

vi.stubGlobal("ResizeObserver", ResizeObserverMock);
Object.defineProperty(HTMLElement.prototype, "scrollTo", {
  configurable: true,
  value: () => undefined,
});

async function expandTool(container: HTMLDivElement): Promise<void> {
  const trigger = container.querySelector('[data-slot="tool-call"] button');
  if (!(trigger instanceof HTMLElement)) {
    throw new Error("Tool call trigger is missing.");
  }
  await act(async () => {
    trigger.click();
    await Promise.resolve();
  });
}

async function revealAttachmentName(container: HTMLDivElement): Promise<void> {
  const trigger = container.querySelector('[aria-label="Document attachment"]');
  if (!(trigger instanceof HTMLElement)) {
    throw new Error("Document attachment trigger is missing.");
  }
  await act(async () => {
    trigger.focus();
    trigger.dispatchEvent(new Event("focusin", { bubbles: true }));
    await Promise.resolve();
  });
}

function RichHistoryFixture({ conversationId }: { conversationId: string }) {
  const fixture = mockConversationFixtures.find(
    (candidate) => candidate.detail.id === conversationId,
  );
  if (fixture?.detail.replay === undefined) {
    throw new Error(`Rich replay fixture not found: ${conversationId}`);
  }

  const runtime = useLocalRuntime(chatModel, {
    initialMessages: projectConversationReplay(fixture.detail.replay),
  });
  const config = AuiConfig({
    tools: Tools({ toolkit: createAssistantUiToolkit({ mockAgentElements: true }) }),
  });
  return (
    <AssistantRuntimeProvider config={config} runtime={runtime}>
      <AssistantUiConversationSurface
        components={createAssistantUiSemanticThreadComponents(renderFallback, {
          mode: "history",
        })}
      />
    </AssistantRuntimeProvider>
  );
}

async function renderHistory(conversationId: string): Promise<HTMLDivElement> {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  mountedRoots.push(root);
  await act(async () => {
    root.render(<RichHistoryFixture conversationId={conversationId} />);
    await Promise.resolve();
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

describe("assistant-ui rich history UI integration", () => {
  it("renders persisted Agent Elements through the toolkit", async () => {
    const container = await renderHistory("conversation-replay-agent-elements");

    expect(container.querySelector('[data-slot="agent-plan"]')).not.toBeNull();
    expect(container.querySelector('[data-slot="agent-status"]')).not.toBeNull();
    expect(container.querySelector('[data-slot="subagent-list"]')).not.toBeNull();
    const subagentList = container.querySelector('[data-slot="subagent-list"]');
    expect(subagentList?.classList.contains("min-h-0")).toBe(true);
    expect(subagentList?.classList.contains("min-h-[14.5rem]")).toBe(false);
    expect(container.textContent).toContain("Analysis complete");
  });

  it("renders persisted SearchFiles history through the official Tool UI", async () => {
    const container = await renderHistory("conversation-replay-tool");

    expect(container.querySelector('[data-slot="tool-call"]')).not.toBeNull();
    await expandTool(container);
    expect(container.textContent).toContain("Searched files");
    expect(container.textContent).toContain("Request");
    expect(container.textContent).toContain("Result");
  });

  it("renders persisted sources and attachments in the Thread", async () => {
    const container = await renderHistory("conversation-replay-sources-attachments");

    await revealAttachmentName(container);
    expect(document.body.textContent).toContain("architecture-notes.md");
    expect(container.textContent).toContain("AG-UI Runtime Notes");
    expect(container.textContent).toContain("Architecture Notes");
  });

  it("renders persisted tool errors as terminal fallback UI", async () => {
    const container = await renderHistory("conversation-replay-tool-error");

    expect(container.querySelector('[data-slot="tool-fallback-root"]')).not.toBeNull();
    expect(container.querySelector('[data-slot="tool-call"]')).toBeNull();
    expect(container.textContent).not.toContain("Allow");
  });
});
