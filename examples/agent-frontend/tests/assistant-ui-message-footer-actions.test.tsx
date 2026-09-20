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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ConversationAdapter } from "../agent-ui/conversation/ConversationAdapter";
import type {
  UIPluginComponentProps,
  UIPluginDefinition,
} from "../framework/contracts/ui-plugin";
import { assistantUiCopyActionPlugin } from "../plugins/assistant-ui-copy-action/definition";
import { assistantUiExportMarkdownActionPlugin } from "../plugins/assistant-ui-export-markdown-action/definition";
import { assistantUiMessageFooterPlugin } from "../plugins/assistant-ui-message-footer/definition";
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

function ConversationActionHost({
  renderScopedSlot,
}: UIPluginComponentProps) {
  return (
    <ConversationAdapter
      renderScopedSlot={(slotName, scope) =>
        slotName === "assistantMessageFooter"
          ? renderScopedSlot(slotName, scope)
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
        assistantMessageFooter: {
          description: "Assistant message footer renderer.",
          cardinality: "one",
          mode: "renderer",
          optional: true,
          accepts: {
            anyOfCapabilities: ["conversation-assistant-message-footer-renderer"],
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
  assistantUiMessageFooterPlugin,
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
      pluginId: "assistant-ui-message-footer",
      enabled: true,
      mount: {
        slotId: resolveRuntimePluginSlotId(
          "host",
          "assistantMessageFooter",
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

function assistantMessage(text = "Answer"): ThreadMessage {
  return {
    id: "assistant-action-message",
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
}: {
  chatModel: ChatModelAdapter;
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
        model={model}
        registry={registry}
        run={{ status: "idle" }}
        state={null}
      />
    </AssistantRuntimeProvider>
  );
}

async function mount(chatModel: ChatModelAdapter) {
  let runtime: AssistantRuntime | undefined;
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);

  await act(async () => {
    root.render(
      <RuntimeFixture
        chatModel={chatModel}
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

function findFooterButton(container: HTMLDivElement, label: string): HTMLButtonElement {
  const footer = container.querySelector(
    '[data-ui-plugin="assistant-ui-message-footer"]',
  );
  if (!(footer instanceof HTMLElement)) {
    throw new Error("Assistant message footer is missing");
  }

  const button = [...footer.querySelectorAll("button")].find((candidate) =>
    candidate.textContent?.includes(label),
  );
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`Footer action button "${label}" is missing`);
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

describe("assistant-ui message footer action Plugins", () => {
  it("keeps the Footer root horizontal and updates copied state through the child Plugin", async () => {
    const writeText = vi.fn(async () => undefined);
    const restoreClipboard = installClipboardMock(writeText);

    try {
      const { container } = await mount({ run: async () => ({ content: [] }) });
      const footer = container.querySelector(
        '[data-ui-plugin="assistant-ui-message-footer"]',
      );
      expect(footer?.classList.contains("flex")).toBe(true);
      expect(footer?.classList.contains("items-center")).toBe(true);

      const copy = findFooterButton(container, "复制");
      expect(copy.disabled).toBe(false);
      await act(async () => {
        copy.click();
        await Promise.resolve();
      });

      expect(writeText).toHaveBeenCalledWith("Answer");
      expect(container.querySelector('[aria-label="已复制"]')).not.toBeNull();
    } finally {
      restoreClipboard();
    }
  });

  it("routes Reload from the child Plugin to the current assistant message", async () => {
    const run = vi.fn<ChatModelAdapter["run"]>(async () => ({
      content: [{ type: "text", text: "Reloaded" }],
    }));
    const { container } = await mount({ run });

    const reload = findFooterButton(container, "重新生成");
    expect(reload.disabled).toBe(false);
    await act(async () => {
      reload.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(run).toHaveBeenCalledTimes(1);
  });

  it("triggers assistant-ui Markdown export from the child Plugin", async () => {
    const createObjectURL = vi.fn(() => "blob:assistant-action");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", { createObjectURL, revokeObjectURL });
    const anchorClick = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);
    const { container } = await mount({ run: async () => ({ content: [] }) });

    await act(async () => {
      findFooterButton(container, "导出 Markdown").click();
      await Promise.resolve();
    });

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(createObjectURL.mock.calls[0]?.[0]).toBeInstanceOf(Blob);
    expect(anchorClick).toHaveBeenCalledTimes(1);
  });
});
