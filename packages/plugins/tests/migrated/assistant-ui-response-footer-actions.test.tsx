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
import { AgentUIRoot } from "../../src/internal/style-boundary/AgentUIRoot";
import { projectLangChainHistory } from "@za38.03/agent-ui-runtime";
import { AgentUILocaleProvider, useAgentUILocale, useConversationState } from "@za38.03/agent-ui-plugins";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ConversationAdapter } from "../../resources/registry/items/foundation/core-adapters/files/agent-ui/conversation/ConversationAdapter";
import type {
  UIPluginComponentProps,
  UIPluginDefinition,
} from "../../../operator/src/framework/contracts/ui-plugin";
import { conversationCopyActionPlugin } from "../../resources/registry/items/plugin/copy-action/files/plugins/copy-action/definition";
import { conversationExportMarkdownActionPlugin } from "../../resources/registry/items/plugin/export-markdown-action/files/plugins/export-markdown-action/definition";
import { conversationSurfacePlugin } from "../../resources/registry/items/plugin/conversation-surface/files/plugins/conversation-surface/definition";
import { conversationResponseFooterPlugin } from "../../resources/registry/items/plugin/response-footer/files/plugins/response-footer/definition";
import { conversationReloadActionPlugin } from "../../resources/registry/items/plugin/reload-action/files/plugins/reload-action/definition";
import { AGENT_UI_THEME_SERVICE } from "../../resources/registry/items/foundation/core-application/files/services/agent-ui-theme";
import {
  parseAppUIRuntimeModel,
  type AppUIRuntimeModel,
} from "../../../operator/src/framework/contracts/app-ui-runtime-model";
import { resolveRuntimePluginSlotId } from "../../../operator/src/framework/contracts/app-ui-composition";
import { createPluginRegistry } from "../../resources/registry/items/foundation/core-runtime/files/runtime/plugins/index";
import { PluginRuntimeFixture } from "../../../operator/tests/support/agent-runtime-fixture";

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
  const labels = useAgentUILocale("conversation");
  return (
    <ConversationAdapter labels={labels}
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

import { AGENT_UI_CONVERSATION_SERVICE, createConversationService } from "../../resources/registry/items/foundation/core-application/files/services/conversations";
const conversationFixtureProvider: UIPluginDefinition = {
  manifest: { id: "test-conversation-service", name: "Fixture", description: "Fixture", version: "1.0.0", capabilities: ["headless"] },
  provides: [AGENT_UI_CONVERSATION_SERVICE],
  setup: ({ services }) => services.provide(AGENT_UI_CONVERSATION_SERVICE, createConversationService({ dataSource: { list: async () => [], get: async id => ({ id, title: id, history: { format: "langchain", messages: [] } }), delete: async () => {} } })),
  Component: () => null,
};
const registry = createPluginRegistry([
  conversationFixtureProvider,
  conversationActionHostPlugin,
  conversationSurfacePlugin,
  conversationResponseFooterPlugin,
  conversationCopyActionPlugin,
  conversationReloadActionPlugin,
  conversationExportMarkdownActionPlugin,
]);

const model: AppUIRuntimeModel = parseAppUIRuntimeModel({
  root: {
    type: "slot",
    id: "conversation-action-root",
    slotId: "conversation-action-root-slot",
  },
  pluginInstances: {
    service: { id: "service", pluginId: "test-conversation-service", enabled: true },
    host: {
      id: "host",
      pluginId: "conversation-action-test-host",
      enabled: true,
      mount: { slotId: "conversation-action-root-slot" },
    },
    footer: {
      id: "footer",
      pluginId: "response-footer",
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
      pluginId: "copy-action",
      enabled: true,
      mount: { slotId: resolveRuntimePluginSlotId("footer", "actions") },
    },
    reload: {
      id: "reload",
      pluginId: "reload-action",
      enabled: true,
      mount: { slotId: resolveRuntimePluginSlotId("footer", "actions") },
    },
    export: {
      id: "export",
      pluginId: "export-markdown-action",
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

function assistantMessage(text = "Answer", id = "assistant-action-message"): Extract<ThreadMessage, { role: "assistant" }> {
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
      <AgentUIRoot theme="light"><AgentUILocaleProvider locale="zh-CN">
        <RuntimeFixture
          chatModel={chatModel}
          runtimeModel={runtimeModel}
          onRuntime={(value) => {
            runtime = value;
          }}
        />
      </AgentUILocaleProvider></AgentUIRoot>,
    );
    await Promise.resolve();
    await Promise.resolve();
  });

  if (runtime === undefined) {
    throw new Error("Assistant runtime was not captured");
  }
  return { container, runtime };
}

async function openExportMenu(container: HTMLDivElement): Promise<HTMLElement> {
  await act(async () => {
    const more = findActionButton(container, "export-markdown-action");
    more.focus();
    more.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
  });
  const item = container.querySelector<HTMLElement>('[data-slot="agent-ui-message-action-menu"] [role="menuitem"]');
  if (!item) throw new Error("Markdown export menu item was not rendered");
  return item;
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
  it("renders Copy / Reload / More and exports the full response from the scoped menu", async () => {
    const runtimeModel = structuredClone(model);
    const createObjectURL = vi.fn((_blob: Blob | MediaSource) => "blob:response");
    vi.stubGlobal("URL", { createObjectURL, revokeObjectURL: vi.fn() });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    const { container, runtime } = await mount({ run: async () => ({ content: [] }) }, runtimeModel);
    await hydrate(runtime, responseMessages());
    const footer = container.querySelector('[data-ui-plugin="response-footer"]')!;
    expect(footer.querySelectorAll("button")).toHaveLength(3);
    expect(container.querySelector('[data-slot="agent-ui-message-action-menu"]')).toBeNull();
    await act(async () => {
      const more = findActionButton(container, "export-markdown-action");
      more.focus();
      more.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    });
    const menu = container.querySelector('[data-slot="agent-ui-message-action-menu"]')!;
    expect(menu.closest("[data-agent-ui-portal-root]")).not.toBeNull();
    const item = menu.querySelector<HTMLElement>('[role="menuitem"]')!;
    expect(item.textContent).toContain("导出为 Markdown");
    await act(async () => { item.click(); });
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const text = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.readAsText(createObjectURL.mock.calls[0]![0] as Blob);
    });
    expect(text).toBe("Hello\n\nWorld\n\nSummary");
  });

  it("keeps Copy and Export disabled for the localized empty cancelled response", async () => {
    const runtimeModel = structuredClone(model);
    runtimeModel.pluginInstances.host!.pluginId = "conversation-surface";
    const { container, runtime } = await mount({ run: async () => ({ content: [] }) }, runtimeModel);
    const cancelled: ThreadMessage = {
      ...assistantMessage("", "cancelled-empty"),
      content: [],
      status: { type: "incomplete", reason: "cancelled" },
    };
    await hydrate(runtime, [userMessage("u"), cancelled]);
    expect(container.querySelector('[data-slot="aui_assistant-message-cancelled"]')?.textContent).toBe("生成已停止");
    expect(findActionButton(container, "copy-action").disabled).toBe(true);
    const exportItem = await openExportMenu(container);
    expect(exportItem.getAttribute("aria-disabled")).toBe("true");
    expect(findActionButton(container, "reload-action").disabled).toBe(false);
    expect(runtime.thread.getState().messages.at(-1)?.content).toEqual([]);
  });

  it("keeps the Footer root horizontal and updates copied state through the child Plugin", async () => {
    const writeText = vi.fn(async () => undefined);
    const restoreClipboard = installClipboardMock(writeText);

    try {
      const { container } = await mount({ run: async () => ({ content: [] }) });
      const footer = container.querySelector(
        '[data-ui-plugin="response-footer"]',
      );
      expect(footer?.classList.contains("flex")).toBe(true);
      expect(footer?.classList.contains("items-center")).toBe(true);

      const copy = findActionButton(container, "copy-action");
      expect(copy.disabled).toBe(false);
      await act(async () => {
        copy.click();
        await Promise.resolve();
      });

      expect(writeText).toHaveBeenCalledWith("Answer");
      expect(
        container.querySelector(
          '[data-slot="copy-action-copied"]',
        ),
      ).not.toBeNull();
    } finally {
      restoreClipboard();
    }
  });

  it("reports clipboard rejection without success and allows an explicit retry", async () => {
    const writeText = vi.fn().mockRejectedValueOnce(new DOMException("Denied", "NotAllowedError")).mockResolvedValueOnce(undefined);
    const restoreClipboard = installClipboardMock(writeText);
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const { container } = await mount({ run: async () => ({ content: [] }) });
      const copy = findActionButton(container, "copy-action");
      await act(async () => { copy.click(); await Promise.resolve(); });
      expect(container.querySelector('[data-slot="copy-action-error"]')?.getAttribute("role")).toBe("status");
      expect(container.querySelector('[data-slot="copy-action-error"]')?.textContent).toBeTruthy();
      expect(container.querySelector('[data-slot="copy-action-copied"]')).toBeNull();
      await act(async () => { copy.click(); await Promise.resolve(); });
      expect(writeText).toHaveBeenCalledTimes(2);
      expect(container.querySelector('[data-slot="copy-action-error"]')).toBeNull();
      expect(container.querySelector('[data-slot="copy-action-copied"]')).not.toBeNull();
    } finally { restoreClipboard(); errorLog.mockRestore(); }
  });

  it("routes Reload from the child Plugin to the response head", async () => {
    const run = vi.fn<ChatModelAdapter["run"]>(async () => ({
      content: [{ type: "text", text: "Reloaded" }],
    }));
    const { container } = await mount({ run });

    const reload = findActionButton(container, "reload-action");
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
      (await openExportMenu(container)).click();
      await Promise.resolve();
    });

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(createObjectURL.mock.calls[0]?.[0]).toBeInstanceOf(Blob);
    expect(anchorClick).toHaveBeenCalledTimes(1);
  });
});

function userMessage(id: string): ThreadMessage {
  return {
    id, createdAt: new Date(0), role: "user",
    content: [{ type: "text", text: "Question" }],
    attachments: [], metadata: { custom: {} },
  };
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
  { id: "s", createdAt: new Date(0), role: "system", content: [{ type: "text", text: "Internal" }], metadata: { custom: {} } } satisfies ThreadMessage,
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
      const compositionModel = structuredClone(model);
      {
        compositionModel.pluginInstances.host!.pluginId = "conversation-surface";
        compositionModel.pluginInstances.footer!.pluginId = "response-footer";
        compositionModel.pluginInstances.footer!.mount = {
          slotId: resolveRuntimePluginSlotId("host", "assistantResponseFooter"),
        };
      }
      const { container, runtime } = await mount({ run }, compositionModel);
      const messages = responseMessages(); // User, A, System, B, C
      await act(async () => runtime.thread.import({
        headId: "c",
        messages: [
          ...messages.map((message, i) => ({ message, parentId: messages[i - 1]?.id ?? null })),
          { message: assistantMessage("Alternative", "alt"), parentId: "u" },
        ],
      }));
      const assistants = container.querySelectorAll('[data-slot="aui_assistant-message-root"]');
      expect(assistants).toHaveLength(3);
      expect(container.querySelectorAll('[data-slot="aui_assistant-response-footer"]')).toHaveLength(1);
      expect(Array.from(assistants, (message) =>
        message.querySelector('[data-slot="aui_assistant-response-footer"]') !== null,
      )).toEqual([false, false, true]);
      await act(async () => {
        findActionButton(container, "copy-action").click();
        await Promise.resolve();
        (await openExportMenu(container)).click();
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
        findActionButton(container, "reload-action").click();
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
      await act(async () => { findActionButton(container, "copy-action").click(); await Promise.resolve(); });
      expect(writeText).toHaveBeenCalledExactlyOnceWith("Hello\n\nWorld\n\nSummary");
      expect(container.querySelector('[data-slot="message-copied-probe"]')?.getAttribute("data-copied")).toBe("false");
      expect(container.querySelector('[data-slot="copy-action-copied"]')).not.toBeNull();
    } finally { restore(); }
  });

  it("exports the same complete response text", async () => {
    const createObjectURL = vi.fn((_blob: Blob | MediaSource) => "blob:response");
    vi.stubGlobal("URL", { createObjectURL, revokeObjectURL: vi.fn() });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    const { container, runtime } = await mount({ run: async () => ({ content: [] }) });
    await hydrate(runtime, responseMessages());
    await act(async () => { (await openExportMenu(container)).click(); });
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
    await act(async () => { findActionButton(container, "reload-action").click(); await Promise.resolve(); });
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
    await act(async () => { findActionButton(container, "reload-action").click(); });
    expect(runtime.thread.getState().isRunning).toBe(true);
    expect(container.querySelectorAll('[data-slot="aui_assistant-response-footer"]')).toHaveLength(0);
    await act(async () => { finish?.({ content: [{ type: "text", text: "Complete" }] }); await Promise.resolve(); });
    expect(container.querySelectorAll('[data-slot="aui_assistant-response-footer"]')).toHaveLength(1);
  });
});

it("renders the response Footer slot with current surface and action sources", async () => {
  const legacy = structuredClone(model);
  legacy.pluginInstances.host!.pluginId = "conversation-surface";
  legacy.pluginInstances.footer!.pluginId = "response-footer";
  legacy.pluginInstances.footer!.mount = { slotId: resolveRuntimePluginSlotId("host", "assistantResponseFooter") };
  const writeText = vi.fn(async () => undefined);
  const restore = installClipboardMock(writeText);
  try {
    const { container, runtime } = await mount({ run: async () => ({ content: [] }) }, legacy);
    await hydrate(runtime, responseMessages());
    expect(container.querySelectorAll('[data-slot="aui_assistant-response-footer"]')).toHaveLength(1);
    expect(container.querySelector('[data-plugin-id="response-footer"]')).not.toBeNull();
    await act(async () => { findActionButton(container, "copy-action").click(); });
    expect(writeText).toHaveBeenCalledExactlyOnceWith("Hello\n\nWorld\n\nSummary");
  } finally { restore(); }
});
