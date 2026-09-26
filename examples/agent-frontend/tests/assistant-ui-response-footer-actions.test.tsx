// @vitest-environment jsdom

import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  AssistantRuntimeProvider,
  AuiConfig,
  useLocalRuntime,
  type AssistantRuntime,
  type ChatModelAdapter,
  type ThreadMessage,
} from "@assistant-ui/react";
import { projectLangChainHistory } from "@agent-ui/runtime-conversation";
import { useConversationState } from "@agent-ui/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ConversationAdapter } from "../agent-ui/conversation/ConversationAdapter";
import type {
  UIPluginComponentProps,
  UIPluginDefinition,
} from "../framework/contracts/ui-plugin";
import { assistantUiCopyActionPlugin } from "../plugins/assistant-ui-copy-action/definition";
import { assistantUiExportMarkdownActionPlugin } from "../plugins/assistant-ui-export-markdown-action/definition";
import { assistantUiMessageFooterPlugin } from "../plugins/assistant-ui-message-footer/definition";
import { conversationSurfacePlugin } from "../plugins/conversation-surface/definition";
import { assistantUiResponseFooterPlugin } from "../plugins/assistant-ui-response-footer/definition";
import { assistantUiReloadActionPlugin } from "../plugins/assistant-ui-reload-action/definition";
import { AGENT_UI_THEME_SERVICE } from "../services/agent-ui-theme";
import {
  parseAppUIRuntimeModel,
  type AppUIRuntimeModel,
} from "../framework/contracts/app-ui-runtime-model";
import { resolveRuntimePluginSlotId } from "../framework/contracts/app-ui-composition";
import { createPluginRegistry } from "../runtime/plugins";
import { PluginRuntimeFixture } from "./agent-runtime-fixture";

const assistantConfig = AuiConfig({});
const roots: Root[] = [];
const appUIModelHash = "f".repeat(64);

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

class ResizeObserverMock {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

function MessageCopiedProbe() {
  const copied = useConversationState((s) => s.message.isCopied);
  return <span data-slot="message-copied-probe" data-copied={String(copied)} />;
}

function ConversationActionHost({
  renderScopedSlot,
}: UIPluginComponentProps) {
  return (
    <ConversationAdapter
      renderScopedSlot={(slotName, scope) =>
        slotName === "assistantResponseFooter"
          ? <>{renderScopedSlot(slotName, scope)}<MessageCopiedProbe /></>
          : null
      }
    />
  );
}

const conversationActionHostPlugin: UIPluginDefinition = {
  manifest: {
    id: "conversation-action-test-host",
    name: "Conversation Action Test Host",
    description: "Provides a conversation renderer for action integration tests.",
    version: "1.0.0",
    slots: {
      children: {
        assistantResponseFooter: {
          description: "Assistant message footer renderer.",
          cardinality: "one",
          mode: "renderer",
          optional: true,
          accepts: {
            anyOfCapabilities: ["conversation-assistant-response-footer-renderer"],
          },
        },
      },
    },
  },
  optionalInject: [AGENT_UI_THEME_SERVICE],
  Component: ConversationActionHost,
};

const registry = createPluginRegistry([
  conversationActionHostPlugin,
  conversationSurfacePlugin,
  assistantUiMessageFooterPlugin,
  assistantUiResponseFooterPlugin,
  assistantUiCopyActionPlugin,
  assistantUiReloadActionPlugin,
  assistantUiExportMarkdownActionPlugin,
]);

const model: AppUIRuntimeModel = parseAppUIRuntimeModel({
  root: {
    type: "slot",
    id: "conversation-action-root",
    slotId: "conversation-action-root-slot",
  },
  pluginInstances: {
    host: {
      id: "host",
      pluginId: "conversation-action-test-host",
      enabled: true,
      mount: { slotId: "conversation-action-root-slot" },
    },
    footer: {
      id: "footer",
      pluginId: "assistant-ui-response-footer",
      enabled: true,
      mount: {
        slotId: resolveRuntimePluginSlotId(
          "host",
          "assistantResponseFooter",
        ),
      },
    },
    copy: {
      id: "copy",
      pluginId: "assistant-ui-copy-action",
      enabled: true,
      mount: { slotId: resolveRuntimePluginSlotId("footer", "actions") },
    },
    reload: {
      id: "reload",
      pluginId: "assistant-ui-reload-action",
      enabled: true,
      mount: { slotId: resolveRuntimePluginSlotId("footer", "actions") },
    },
    export: {
      id: "export",
      pluginId: "assistant-ui-export-markdown-action",
      enabled: true,
      mount: { slotId: resolveRuntimePluginSlotId("footer", "actions") },
    },
  },
});

const pluginActions = {
  sendMessage: vi.fn(async () => undefined),
  resumeInterrupts: vi.fn(async () => undefined),
  startNewConversation: vi.fn(async () => undefined),
  abortRun: vi.fn(),
};

function assistantMessage(text = "Answer", id = "assistant-action-message"): ThreadMessage {
  return {
    id,
    role: "assistant",
    content: [{ type: "text", text }],
    status: { type: "complete", reason: "stop" },
    createdAt: new Date(0),
    metadata: {
      unstable_state: null,
      unstable_annotations: [],
      unstable_data: [],
      steps: [],
      custom: {},
    },
  };
}

function RuntimeFixture({
  chatModel,
  onRuntime,
  runtimeModel = model,
}: {
  chatModel: ChatModelAdapter;
  runtimeModel?: AppUIRuntimeModel;
  onRuntime(runtime: AssistantRuntime): void;
}) {
  const runtime = useLocalRuntime(chatModel, {
    initialMessages: [assistantMessage()] as never,
  });
  useEffect(() => onRuntime(runtime), [onRuntime, runtime]);

  return (
    <AssistantRuntimeProvider config={assistantConfig} runtime={runtime}>
      <PluginRuntimeFixture
        actions={pluginActions}
        appUIModelHash={appUIModelHash}
        conversation={{ id: "conversation-action-test" }}
        executions={[]}
        interrupts={[]}
        messages={[]}
        model={runtimeModel}
        registry={registry}
        run={{ status: "idle" }}
        state={null}
      />
    </AssistantRuntimeProvider>
  );
}

async function mount(chatModel: ChatModelAdapter, runtimeModel: AppUIRuntimeModel = model) {
  let runtime: AssistantRuntime | undefined;
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);

  await act(async () => {
    root.render(
      <RuntimeFixture
        chatModel={chatModel}
        runtimeModel={runtimeModel}
        onRuntime={(value) => {
          runtime = value;
        }}
      />,
    );
    await Promise.resolve();
    await Promise.resolve();
  });

  if (runtime === undefined) {
    throw new Error("Assistant runtime was not captured");
  }
  return { container, runtime };
}

function findActionButton(
  container: HTMLDivElement,
  pluginId: string,
): HTMLButtonElement {
  const plugin = container.querySelector(
    `[data-plugin-id="${pluginId}"]`,
  );

  if (!(plugin instanceof HTMLElement)) {
    throw new Error(`Action Plugin "${pluginId}" is missing`);
  }

  const button = plugin.querySelector("button");
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`Action Plugin "${pluginId}" does not render a button`);
  }
  return button;
}

function installClipboardMock(writeText: (text: string) => Promise<void>) {
  const previous = Object.getOwnPropertyDescriptor(navigator, "clipboard");
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });

  return () => {
    if (previous === undefined) {
      Reflect.deleteProperty(navigator, "clipboard");
    } else {
      Object.defineProperty(navigator, "clipboard", previous);
    }
  };
}

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", ResizeObserverMock);
  Object.defineProperty(HTMLElement.prototype, "scrollTo", {
    configurable: true,
    value: () => undefined,
  });
});

afterEach(async () => {
  await act(async () => {
    for (const root of roots.splice(0)) root.unmount();
  });
  document.body.replaceChildren();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("assistant-ui response footer action Plugins", () => {
  it("keeps the Footer root horizontal and updates copied state through the child Plugin", async () => {
    const writeText = vi.fn(async () => undefined);
    const restoreClipboard = installClipboardMock(writeText);

    try {
      const { container } = await mount({ run: async () => ({ content: [] }) });
      const footer = container.querySelector(
        '[data-ui-plugin="assistant-ui-response-footer"]',
      );
      expect(footer?.classList.contains("flex")).toBe(true);
      expect(footer?.classList.contains("items-center")).toBe(true);

      const copy = findActionButton(container, "assistant-ui-copy-action");
      expect(copy.disabled).toBe(false);
      await act(async () => {
        copy.click();
        await Promise.resolve();
      });

      expect(writeText).toHaveBeenCalledWith("Answer");
      expect(
        container.querySelector(
          '[data-slot="assistant-ui-copy-action-copied"]',
        ),
      ).not.toBeNull();
    } finally {
      restoreClipboard();
    }
  });

  it("routes Reload from the child Plugin to the response head", async () => {
    const run = vi.fn<ChatModelAdapter["run"]>(async () => ({
      content: [{ type: "text", text: "Reloaded" }],
    }));
    const { container } = await mount({ run });

    const reload = findActionButton(container, "assistant-ui-reload-action");
    expect(reload.disabled).toBe(false);
    await act(async () => {
      reload.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(run).toHaveBeenCalledTimes(1);
  });

  it("exports response Markdown from the child Plugin", async () => {
    const createObjectURL = vi.fn(
      (_object: Blob | MediaSource) => "blob:assistant-action",
    );
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", { createObjectURL, revokeObjectURL });
    const anchorClick = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);
    const { container } = await mount({ run: async () => ({ content: [] }) });

    await act(async () => {
      findActionButton(
        container,
        "assistant-ui-export-markdown-action",
      ).click();
      await Promise.resolve();
    });

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(createObjectURL.mock.calls[0]?.[0]).toBeInstanceOf(Blob);
    expect(anchorClick).toHaveBeenCalledTimes(1);
  });
});

function userMessage(id: string): ThreadMessage {
  return { ...assistantMessage("Question", id), role: "user" } as ThreadMessage;
}

async function hydrate(runtime: AssistantRuntime, messages: ThreadMessage[]) {
  await act(async () => {
    runtime.thread.import({
      headId: messages.at(-1)?.id ?? null,
      messages: messages.map((message, index) => ({ message, parentId: messages[index - 1]?.id ?? null })),
    });
  });
}

const responseMessages = () => [
  userMessage("u"), assistantMessage("Hello", "a"),
  { ...assistantMessage("Internal", "s"), role: "system" } as ThreadMessage,
  assistantMessage("World", "b"), assistantMessage("Summary", "c"),
];

describe("multi-message Response actions", () => {
  it("keeps Footer, Copy, Export, Reload and Branch on one turn across a system record", async () => {
    const writeText = vi.fn(async () => undefined);
    const restore = installClipboardMock(writeText);
    const createObjectURL = vi.fn((_blob: Blob | MediaSource) => "blob:turn");
    vi.stubGlobal("URL", { createObjectURL, revokeObjectURL: vi.fn() });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    const run = vi.fn<ChatModelAdapter["run"]>(async () => ({
      content: [{ type: "text", text: "Regenerated" }],
    }));
    try {
      const { container, runtime } = await mount({ run });
      const messages = responseMessages(); // User, A, System, B, C
      await act(async () => runtime.thread.import({
        headId: "c",
        messages: [
          ...messages.map((message, i) => ({ message, parentId: messages[i - 1]?.id ?? null })),
          { message: assistantMessage("Alternative", "alt"), parentId: "u" },
        ],
      }));
      const assistants = container.querySelectorAll('[data-slot="aui_assistant-message-root"]');
      expect(container.querySelectorAll('[data-slot="aui_assistant-response-footer"]')).toHaveLength(1);
      expect(Array.from(assistants, (message) =>
        message.querySelector('[data-slot="aui_assistant-response-footer"]') !== null,
      )).toEqual([false, false, true]);
      await act(async () => {
        findActionButton(container, "assistant-ui-copy-action").click();
        await Promise.resolve();
        findActionButton(container, "assistant-ui-export-markdown-action").click();
      });
      const expectedText = "Hello\n\nWorld\n\nSummary";
      expect(writeText).toHaveBeenCalledExactlyOnceWith(expectedText);
      const exported = createObjectURL.mock.calls[0]![0] as Blob;
      const exportedText = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.readAsText(exported);
      });
      expect(exportedText).toBe(expectedText);
      expect(exportedText).not.toContain("Internal");
      expect(runtime.thread.getMessageById("a").getState().branchCount).toBe(2);
      expect(runtime.thread.getMessageById("b").getState().branchCount).toBe(1);
      expect(runtime.thread.getMessageById("c").getState().branchCount).toBe(1);
      expect(container.querySelector('.aui-branch-picker-state')?.textContent).toBe("1 / 2");
      await act(async () => {
        (container.querySelector('.aui-branch-picker-root button:last-child') as HTMLButtonElement).click();
      });
      expect(runtime.thread.getState().messages.map(({ id }) => id)).toEqual(["u", "alt"]);
      await act(async () => {
        (container.querySelector('.aui-branch-picker-root button:first-child') as HTMLButtonElement).click();
      });
      expect(runtime.thread.getState().messages.map(({ id }) => id)).toEqual(["u", "a", "s", "b", "c"]);
      await act(async () => {
        findActionButton(container, "assistant-ui-reload-action").click();
        await Promise.resolve();
      });
      expect(run).toHaveBeenCalledOnce();
      expect(run.mock.calls[0]![0].messages.map(({ id }) => id)).toEqual(["u"]);
    } finally { restore(); }
  });

  it("hydrates separate messages and places one Footer under the tail", async () => {
    const { container, runtime } = await mount({ run: async () => ({ content: [] }) });
    await hydrate(runtime, responseMessages());
    const roots = container.querySelectorAll('[data-slot="aui_assistant-message-root"]');
    expect(roots).toHaveLength(3);
    expect(container.querySelectorAll('[data-slot="aui_assistant-response-footer"]')).toHaveLength(1);
    expect(roots[0]?.querySelector('[data-slot="aui_assistant-response-footer"]')).toBeNull();
    expect(roots[1]?.querySelector('[data-slot="aui_assistant-response-footer"]')).toBeNull();
    expect(roots[2]?.querySelector('[data-slot="aui_assistant-response-footer"]')).not.toBeNull();
    expect(runtime.thread.getState().messages.map(({ id }) => id)).toEqual(["u", "a", "s", "b", "c"]);
  });

  it("renders one Turn Footer per user request across system records", async () => {
    const { container, runtime } = await mount({ run: async () => ({ content: [] }) });
    await hydrate(runtime, [...responseMessages(), userMessage("u2"), assistantMessage("Next", "d"), assistantMessage("Done", "e")]);
    expect(container.querySelectorAll('[data-slot="aui_assistant-response-footer"]')).toHaveLength(2);
    const assistants = container.querySelectorAll('[data-slot="aui_assistant-message-root"]');
    expect(assistants).toHaveLength(5);
    expect(Array.from(assistants, (message) =>
      message.querySelector('[data-slot="aui_assistant-response-footer"]') !== null,
    )).toEqual([false, false, true, false, true]);
  });

  it("moves the semantic Footer when another assistant message arrives in the same turn", async () => {
    const { container, runtime } = await mount({ run: async () => ({ content: [] }) });
    await hydrate(runtime, [userMessage("u"), assistantMessage("First", "a")]);
    expect(container.querySelectorAll('[data-slot="aui_assistant-response-footer"]')).toHaveLength(1);
    await hydrate(runtime, [userMessage("u"), assistantMessage("First", "a"), assistantMessage("Second", "b")]);
    const assistants = container.querySelectorAll('[data-slot="aui_assistant-message-root"]');
    expect(container.querySelectorAll('[data-slot="aui_assistant-response-footer"]')).toHaveLength(1);
    expect(assistants[0]?.querySelector('[data-slot="aui_assistant-response-footer"]')).toBeNull();
    expect(assistants[1]?.querySelector('[data-slot="aui_assistant-response-footer"]')).not.toBeNull();
  });

  it("reconstructs checkpoint turns after history is loaded into a fresh runtime", async () => {
    const history = projectLangChainHistory([
      { id: "u", type: "human", content: "Question" },
      { id: "a", type: "ai", content: "First" },
      { id: "b", type: "ai", content: "Second" },
      { id: "u2", type: "human", content: "Next question" },
      { id: "c", type: "ai", content: "Next" },
      { id: "d", type: "ai", content: "Done" },
    ]) as unknown as ThreadMessage[];
    const first = await mount({ run: async () => ({ content: [] }) });
    await hydrate(first.runtime, history);
    expect(first.container.querySelectorAll('[data-slot="aui_assistant-response-footer"]')).toHaveLength(2);
    const restored = await mount({ run: async () => ({ content: [] }) });
    await hydrate(restored.runtime, history);
    expect(restored.container.querySelectorAll('[data-slot="aui_assistant-response-footer"]')).toHaveLength(2);
  });

  it("copies all response text once and keeps copied feedback local", async () => {
    const writeText = vi.fn(async () => undefined);
    const restore = installClipboardMock(writeText);
    try {
      const { container, runtime } = await mount({ run: async () => ({ content: [] }) });
      await hydrate(runtime, responseMessages());
      await act(async () => { findActionButton(container, "assistant-ui-copy-action").click(); await Promise.resolve(); });
      expect(writeText).toHaveBeenCalledExactlyOnceWith("Hello\n\nWorld\n\nSummary");
      expect(container.querySelector('[data-slot="message-copied-probe"]')?.getAttribute("data-copied")).toBe("false");
      expect(container.querySelector('[data-slot="assistant-ui-copy-action-copied"]')).not.toBeNull();
    } finally { restore(); }
  });

  it("exports the same complete response text", async () => {
    const createObjectURL = vi.fn((_blob: Blob | MediaSource) => "blob:response");
    vi.stubGlobal("URL", { createObjectURL, revokeObjectURL: vi.fn() });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    const { container, runtime } = await mount({ run: async () => ({ content: [] }) });
    await hydrate(runtime, responseMessages());
    await act(async () => { findActionButton(container, "assistant-ui-export-markdown-action").click(); });
    const blob = createObjectURL.mock.calls[0]![0] as Blob;
    const text = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.readAsText(blob);
    });
    expect(text).toBe("Hello\n\nWorld\n\nSummary");
  });

  it("reloads from the request before the response head", async () => {
    const run = vi.fn<ChatModelAdapter["run"]>(async () => ({ content: [{ type: "text", text: "Regenerated" }] }));
    const { container, runtime } = await mount({ run });
    await hydrate(runtime, responseMessages());
    await act(async () => { findActionButton(container, "assistant-ui-reload-action").click(); await Promise.resolve(); });
    expect(run).toHaveBeenCalledOnce();
    expect(run.mock.calls[0]![0].messages.map(({ id }) => id)).toEqual(["u"]);
    expect(runtime.thread.getState().messages.map(({ id }) => id)).not.toContain("a");
    expect(runtime.thread.getState().messages.map(({ id }) => id)).not.toContain("c");
  });

  it("shows and switches branches at the head rather than tail", async () => {
    const { container, runtime } = await mount({ run: async () => ({ content: [] }) });
    const messages = responseMessages();
    await act(async () => runtime.thread.import({
      headId: "c",
      messages: [
        ...messages.map((message, i) => ({ message, parentId: messages[i - 1]?.id ?? null })),
        { message: assistantMessage("Alternative", "alt"), parentId: "u" },
      ],
    }));
    expect(runtime.thread.getMessageById("a").getState().branchCount).toBe(2);
    expect(runtime.thread.getMessageById("c").getState().branchCount).toBe(1);
    expect(container.querySelector('.aui-branch-picker-state')?.textContent).toBe("1 / 2");
    const next = container.querySelector('.aui-branch-picker-root button:last-child') as HTMLButtonElement;
    await act(async () => next.click());
    expect(runtime.thread.getState().messages.map(({ id }) => id)).toEqual(["u", "alt"]);
    expect(container.querySelectorAll('[data-slot="aui_assistant-response-footer"]')).toHaveLength(1);
    expect(container.querySelector('.aui-branch-picker-state')?.textContent).toBe("2 / 2");
    const previous = container.querySelector('.aui-branch-picker-root button:first-child') as HTMLButtonElement;
    await act(async () => previous.click());
    expect(runtime.thread.getState().messages.map(({ id }) => id)).toEqual(["u", "a", "s", "b", "c"]);
  });

  it("hides the Footer throughout generation and restores it after completion", async () => {
    let finish: ((result: { content: [{ type: "text"; text: string }] }) => void) | undefined;
    const { container, runtime } = await mount({ run: () => new Promise((resolve) => { finish = resolve; }) });
    await hydrate(runtime, responseMessages());
    await act(async () => { findActionButton(container, "assistant-ui-reload-action").click(); });
    expect(runtime.thread.getState().isRunning).toBe(true);
    expect(container.querySelectorAll('[data-slot="aui_assistant-response-footer"]')).toHaveLength(0);
    await act(async () => { finish?.({ content: [{ type: "text", text: "Complete" }] }); await Promise.resolve(); });
    expect(container.querySelectorAll('[data-slot="aui_assistant-response-footer"]')).toHaveLength(1);
  });
});

it("renders the old Footer slot and Plugin with latest surface and action sources", async () => {
  const legacy = structuredClone(model);
  legacy.pluginInstances.host!.pluginId = "conversation-surface";
  legacy.pluginInstances.footer!.pluginId = "assistant-ui-message-footer";
  legacy.pluginInstances.footer!.mount = { slotId: resolveRuntimePluginSlotId("host", "assistantMessageFooter") };
  const writeText = vi.fn(async () => undefined);
  const restore = installClipboardMock(writeText);
  try {
    const { container, runtime } = await mount({ run: async () => ({ content: [] }) }, legacy);
    await hydrate(runtime, responseMessages());
    expect(container.querySelectorAll('[data-slot="aui_assistant-response-footer"]')).toHaveLength(1);
    expect(container.querySelector('[data-plugin-id="assistant-ui-message-footer"]')).not.toBeNull();
    await act(async () => { findActionButton(container, "assistant-ui-copy-action").click(); });
    expect(writeText).toHaveBeenCalledExactlyOnceWith("Hello\n\nWorld\n\nSummary");
  } finally { restore(); }
});
