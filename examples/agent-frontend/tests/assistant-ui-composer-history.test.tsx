// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ConversationRuntimeProvider,
  type ConversationAgentFactory,
  type ConversationThreadBinding,
} from "@agent-ui/runtime-conversation";
import type { UIPluginComponentProps, UIPluginDefinition } from "../framework/contracts/ui-plugin";
import {
  parseAppUIRuntimeModel,
  type AppUIRuntimeModel,
} from "../framework/contracts/app-ui-runtime-model";
import { resolveRuntimePluginSlotId } from "../framework/contracts/app-ui-composition";
import { ConversationSurface } from "../agent-ui/conversation/ConversationSurface";
import { createConversationServiceThreadBinding } from "../agent-ui/conversation/threads/conversation-service-thread-binding";
import {
  createConversationService,
  type ConversationDataSource,
} from "../services/conversations";
import { assistantUiComposerPlugin } from "../plugins/assistant-ui-composer/definition";
import { assistantUiSubmitActionPlugin } from "../plugins/assistant-ui-submit-action/definition";
import { createPluginRegistry } from "../runtime/plugins";
import { PluginRuntimeFixture } from "./agent-runtime-fixture";

const roots: Root[] = [];
const rootSlotId = "assistant-ui-composer-history-test-root";
const appUIModelHash = "d".repeat(64);

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

class ResizeObserverMock {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

function ComposerHost({ renderSlot }: UIPluginComponentProps) {
  return (
    <ConversationSurface
      autoFocus={false}
      composer={renderSlot("composer", null)}
    />
  );
}

const composerHostPlugin: UIPluginDefinition = {
  manifest: {
    id: "assistant-ui-composer-history-test-host",
    name: "Assistant UI Composer History Test Host",
    description: "Provides the conversation surface for history composer tests.",
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
  assistantUiSubmitActionPlugin,
]);

const pluginActions = {
  sendMessage: vi.fn(async () => undefined),
  resumeInterrupts: vi.fn(async () => undefined),
  startNewConversation: vi.fn(async () => undefined),
  abortRun: vi.fn(),
};

function createCompositionModel(): AppUIRuntimeModel {
  return parseAppUIRuntimeModel({
    root: {
      type: "slot",
      id: "assistant-ui-composer-history-test-root-node",
      slotId: rootSlotId,
    },
    pluginInstances: {
      host: {
        id: "host",
        pluginId: "assistant-ui-composer-history-test-host",
        enabled: true,
        mount: { slotId: rootSlotId },
      },
      composer: {
        id: "composer",
        pluginId: "assistant-ui-composer",
        enabled: true,
        mount: {
          slotId: resolveRuntimePluginSlotId("host", "composer"),
        },
      },
      submit: {
        id: "submit",
        pluginId: "assistant-ui-submit-action",
        enabled: true,
        mount: {
          slotId: resolveRuntimePluginSlotId("composer", "submitAction"),
        },
      },
    },
  });
}

function createAgent(): ReturnType<ConversationAgentFactory> {
  return {
    threadId: "live",
    runAgent: vi.fn(),
    abortRun: vi.fn(),
    subscribe: vi.fn(() => ({ unsubscribe: vi.fn() })),
  } as never;
}

function createHistoryBinding() {
  const dataSource: ConversationDataSource = {
    list: async () => [{ id: "history-thread", title: "History thread" }],
    get: async (id) => ({
      id,
      title: "History thread",
      history: {
        format: "langchain",
        messages: [{
          id: "history-user",
          type: "human",
          content: "previous message",
        }],
      },
    }),
  };
  const service = createConversationService({ dataSource });
  const binding = createConversationServiceThreadBinding();
  const detach = binding.attachConversationService(service);
  return { binding, detach, service };
}

function RuntimeFixture({
  agent,
  binding,
}: {
  agent: ReturnType<ConversationAgentFactory>;
  binding: ConversationThreadBinding;
}) {
  return (
    <ConversationRuntimeProvider
      endpoint="http://example.test/agent"
      threadBinding={binding}
      unstable_agentFactory={({ threadId }) => ({ ...agent, threadId }) as never}
    >
      <PluginRuntimeFixture
        actions={pluginActions}
        appUIModelHash={appUIModelHash}
        conversation={{ id: "history-thread" }}
        executions={[]}
        interrupts={[]}
        messages={[]}
        model={createCompositionModel()}
        registry={registry}
        run={{ status: "idle" }}
        state={null}
      />
    </ConversationRuntimeProvider>
  );
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

function findSendButton(container: HTMLDivElement): HTMLButtonElement {
  const button = container.querySelector(
    '[data-plugin-id="assistant-ui-submit-action"] .aui-composer-send',
  );
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error("Composer send action is missing");
  }
  return button;
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

describe("assistant-ui Composer history continuation behavior", () => {
  it("enables the composed Composer on persisted history without starting a run merely by opening it", async () => {
    const { binding, detach, service } = createHistoryBinding();
    const agent = createAgent();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    roots.push(root);

    try {
      await service.refresh();
      await binding.selectThread("history-thread");
      expect(binding.getIsDisabled?.()).toBe(false);

      await act(async () => {
        root.render(<RuntimeFixture agent={agent} binding={binding} />);
        await Promise.resolve();
        await Promise.resolve();
      });

      const input = findComposerInput(container);
      const send = findSendButton(container);
      expect(input.disabled).toBe(false);
      expect(send.disabled).toBe(true);

      await act(async () => {
        send.click();
        await Promise.resolve();
      });

      expect(agent.runAgent).not.toHaveBeenCalled();
    } finally {
      detach();
      service.dispose();
    }
  });
});
