// @vitest-environment jsdom

import { act, createContext, useContext, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  AssistantRuntimeProvider,
  AuiConfig,
  useLocalRuntime,
  type AssistantRuntime,
  type ChatModelAdapter,
} from "@assistant-ui/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ConversationSurface } from "../agent-ui/conversation/ConversationSurface";
import type {
  UIPluginComponentProps,
  UIPluginDefinition,
} from "../framework/contracts/ui-plugin";
import {
  parseAppUIRuntimeModel,
  type AppUIRuntimeModel,
  type AppUIRuntimePluginInstance,
} from "../framework/contracts/app-ui-runtime-model";
import { resolveRuntimePluginSlotId } from "../framework/contracts/app-ui-composition";
import { assistantUiAddAttachmentActionPlugin } from "../plugins/assistant-ui-add-attachment-action/definition";
import { assistantUiComposerPlugin } from "../plugins/assistant-ui-composer/definition";
import { assistantUiDictationActionPlugin } from "../plugins/assistant-ui-dictation-action/definition";
import { assistantUiSubmitActionPlugin } from "../plugins/assistant-ui-submit-action/definition";
import { createPluginRegistry } from "../runtime/plugins";
import { PluginRuntimeFixture } from "./agent-runtime-fixture";

const assistantConfig = AuiConfig({});
const roots: Root[] = [];
const appUIModelHash = "c".repeat(64);
const rootSlotId = "assistant-ui-composer-test-root";
const ComposerAutoFocusContext = createContext(false);

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

class ResizeObserverMock {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

function ComposerHost({ renderSlot }: UIPluginComponentProps) {
  const autoFocus = useContext(ComposerAutoFocusContext);
  return (
    <ConversationSurface
      autoFocus={autoFocus}
      composer={renderSlot("composer", null)}
    />
  );
}

const composerHostPlugin: UIPluginDefinition = {
  manifest: {
    id: "assistant-ui-composer-test-host",
    name: "Assistant UI Composer Test Host",
    description: "Provides the conversation surface for composer integration tests.",
    version: "1.0.0",
    capabilities: ["conversation-surface"],
    slots: {
      children: {
        composer: {
          description: "Primary conversation composer.",
          cardinality: "one",
          optional: true,
          accepts: { anyOfCapabilities: ["conversation-composer"] },
        },
      },
    },
  },
  Component: ComposerHost,
};

const registry = createPluginRegistry([
  composerHostPlugin,
  assistantUiComposerPlugin,
  assistantUiAddAttachmentActionPlugin,
  assistantUiDictationActionPlugin,
  assistantUiSubmitActionPlugin,
]);

const pluginActions = {
  sendMessage: vi.fn(async () => undefined),
  resumeInterrupts: vi.fn(async () => undefined),
  startNewConversation: vi.fn(async () => undefined),
  abortRun: vi.fn(),
};

interface CompositionOptions {
  composer?: boolean;
  attachment?: boolean;
  dictation?: boolean;
  submit?: boolean;
  autoFocus?: boolean;
}

function createCompositionModel({
  composer = true,
  attachment = true,
  dictation = true,
  submit = true,
}: CompositionOptions = {}): AppUIRuntimeModel {
  const pluginInstances: Record<string, AppUIRuntimePluginInstance> = {
    host: {
      id: "host",
      pluginId: "assistant-ui-composer-test-host",
      enabled: true,
      mount: { slotId: rootSlotId },
    },
  };

  if (composer) {
    pluginInstances.composer = {
      id: "composer",
      pluginId: "assistant-ui-composer",
      enabled: true,
      mount: {
        slotId: resolveRuntimePluginSlotId("host", "composer"),
      },
    };
  }
  if (composer && attachment) {
    pluginInstances.attachment = {
      id: "attachment",
      pluginId: "assistant-ui-add-attachment-action",
      enabled: true,
      mount: {
        slotId: resolveRuntimePluginSlotId("composer", "leadingActions"),
      },
    };
  }
  if (composer && dictation) {
    pluginInstances.dictation = {
      id: "dictation",
      pluginId: "assistant-ui-dictation-action",
      enabled: true,
      mount: {
        slotId: resolveRuntimePluginSlotId("composer", "trailingActions"),
      },
    };
  }
  if (composer && submit) {
    pluginInstances.submit = {
      id: "submit",
      pluginId: "assistant-ui-submit-action",
      enabled: true,
      mount: {
        slotId: resolveRuntimePluginSlotId("composer", "submitAction"),
      },
    };
  }

  return parseAppUIRuntimeModel({
    root: {
      type: "slot",
      id: "assistant-ui-composer-test-root-node",
      slotId: rootSlotId,
    },
    pluginInstances,
  });
}

function RuntimeFixture({
  autoFocus,
  chatModel,
  model,
  onRuntime,
}: {
  autoFocus: boolean;
  chatModel: ChatModelAdapter;
  model: AppUIRuntimeModel;
  onRuntime(runtime: AssistantRuntime): void;
}) {
  const runtime = useLocalRuntime(chatModel);
  useEffect(() => onRuntime(runtime), [onRuntime, runtime]);

  return (
    <AssistantRuntimeProvider config={assistantConfig} runtime={runtime}>
      <ComposerAutoFocusContext.Provider value={autoFocus}>
        <PluginRuntimeFixture
          actions={pluginActions}
          appUIModelHash={appUIModelHash}
          conversation={{ id: "assistant-ui-composer-test" }}
          executions={[]}
          interrupts={[]}
          messages={[]}
          model={model}
          registry={registry}
          run={{ status: "idle" }}
          state={null}
        />
      </ComposerAutoFocusContext.Provider>
    </AssistantRuntimeProvider>
  );
}

async function mount(
  chatModel: ChatModelAdapter,
  options: CompositionOptions = {},
) {
  let runtime: AssistantRuntime | undefined;
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);

  await act(async () => {
    root.render(
      <RuntimeFixture
        autoFocus={options.autoFocus ?? false}
        chatModel={chatModel}
        model={createCompositionModel(options)}
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

function findComposerInput(container: HTMLDivElement): HTMLTextAreaElement {
  const input = container.querySelector(
    '[data-slot="aui_composer-shell"] textarea',
  );
  if (!(input instanceof HTMLTextAreaElement)) {
    throw new Error("Composer input is missing");
  }
  return input;
}

function findActionButton(
  container: HTMLDivElement,
  pluginId: string,
  selector = "button",
): HTMLButtonElement {
  const plugin = container.querySelector(`[data-plugin-id="${pluginId}"]`);
  if (!(plugin instanceof HTMLElement)) {
    throw new Error(`Action Plugin "${pluginId}" is missing`);
  }

  const button = plugin.querySelector(selector);
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`Action Plugin "${pluginId}" does not render ${selector}`);
  }
  return button;
}

function setComposerText(input: HTMLTextAreaElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLTextAreaElement.prototype,
    "value",
  )?.set;
  if (setter === undefined) throw new Error("Textarea value setter is missing");
  setter.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
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

describe("assistant-ui Composer action Plugins", () => {
  it("sends input through the assistant-ui ChatModelAdapter", async () => {
    const run = vi.fn<ChatModelAdapter["run"]>(async () => ({
      content: [{ type: "text", text: "Answer" }],
    }));
    const { container } = await mount(run);
    const input = findComposerInput(container);

    await act(async () => {
      setComposerText(input, "hello");
      await Promise.resolve();
    });
    await act(async () => {
      findActionButton(container, "assistant-ui-submit-action", ".aui-composer-send").click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(run).toHaveBeenCalledTimes(1);
  });

  it("switches Send to Cancel and aborts a running assistant-ui run", async () => {
    let runSignal: AbortSignal | undefined;
    const run = vi.fn<ChatModelAdapter["run"]>(async ({ abortSignal }) => {
      runSignal = abortSignal;
      await new Promise<void>((resolve) => {
        if (abortSignal.aborted) {
          resolve();
          return;
        }
        abortSignal.addEventListener("abort", () => resolve(), { once: true });
      });
      return { content: [] };
    });
    const { container } = await mount(run);
    const input = findComposerInput(container);

    await act(async () => {
      setComposerText(input, "hello");
      await Promise.resolve();
      findActionButton(container, "assistant-ui-submit-action", ".aui-composer-send").click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(run).toHaveBeenCalledTimes(1);
    expect(
      container.querySelector(
        '[data-plugin-id="assistant-ui-submit-action"] .aui-composer-send',
      ),
    ).toBeNull();
    const cancel = findActionButton(
      container,
      "assistant-ui-submit-action",
      ".aui-composer-cancel",
    );
    await act(async () => {
      cancel.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(runSignal?.aborted).toBe(true);
  });

  it("keeps Input and Submit functional without the attachment action Plugin", async () => {
    const run = vi.fn<ChatModelAdapter["run"]>(async () => ({ content: [] }));
    const { container } = await mount(run, { attachment: false });

    expect(
      container.querySelector('[data-plugin-id="assistant-ui-add-attachment-action"]'),
    ).toBeNull();
    const input = findComposerInput(container);
    await act(async () => {
      setComposerText(input, "hello");
      await Promise.resolve();
      findActionButton(container, "assistant-ui-submit-action", ".aui-composer-send").click();
      await Promise.resolve();
    });
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("keeps Input and Submit functional without the dictation action Plugin", async () => {
    const run = vi.fn<ChatModelAdapter["run"]>(async () => ({ content: [] }));
    const { container } = await mount(run, { dictation: false });

    expect(
      container.querySelector('[data-plugin-id="assistant-ui-dictation-action"]'),
    ).toBeNull();
    expect(findComposerInput(container)).toBeInstanceOf(HTMLTextAreaElement);
    expect(
      findActionButton(container, "assistant-ui-submit-action", ".aui-composer-send"),
    ).toBeInstanceOf(HTMLButtonElement);
  });

  it("does not restore an upstream Composer when the Composer Slot is empty", async () => {
    const { container } = await mount(
      { run: async () => ({ content: [] }) },
      { composer: false },
    );

    expect(container.querySelector('[data-slot="aui_composer-shell"]')).toBeNull();
    expect(container.querySelector("textarea")).toBeNull();
  });

  it.each([false, true])(
    "passes ConversationSurface autoFocus=%s to the composed input",
    async (autoFocus) => {
      const focus = vi.spyOn(HTMLTextAreaElement.prototype, "focus");
      const { container } = await mount(
        { run: async () => ({ content: [] }) },
        { autoFocus },
      );

      expect(findComposerInput(container)).toBeInstanceOf(HTMLTextAreaElement);
      expect(focus).toHaveBeenCalledTimes(autoFocus ? 1 : 0);
    },
  );
});
