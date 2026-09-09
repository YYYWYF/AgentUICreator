// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";

import { AgentUIRoot } from "../agent-ui/foundation/AgentUIRoot";
import { parseAppUIModel } from "../framework/contracts/app-ui-model";
import type { UIPluginDefinition } from "../framework/contracts/ui-plugin";
import { agentComposerPlugin } from "../plugins/agent-composer/definition";
import {
  useComposerSuggestions,
  type ComposerSuggestionsController,
} from "../plugins/agent-composer/use-composer-suggestions";
import { createPluginRegistry } from "../runtime/plugins";
import {
  AGENT_UI_CONVERSATION_SERVICE,
  EMPTY_CONVERSATION_SNAPSHOT,
  type AgentUIConversationService,
} from "../services/conversations";
import { PluginRuntimeFixture } from "./agent-runtime-fixture";

const historyService: AgentUIConversationService = {
  getSnapshot: () => ({
    ...EMPTY_CONVERSATION_SNAPSHOT,
    mode: "history",
    activeConversationId: "history",
    detailStatus: "ready",
  }),
  subscribe: () => () => undefined,
  refresh: async () => undefined,
  selectConversation: async () => undefined,
  showLiveConversation: () => undefined,
  startNewConversation: async () => undefined,
};

const historyProvider: UIPluginDefinition = {
  manifest: {
    id: "test-history-provider",
    name: "Test History Provider",
    description: "Provides a static history snapshot.",
    version: "1.0.0",
    capabilities: ["headless"],
  },
  provides: [AGENT_UI_CONVERSATION_SERVICE],
  setup: ({ services }) => {
    services.provide(AGENT_UI_CONVERSATION_SERVICE, historyService);
  },
  Component: () => null,
};

describe("AgentComposerPlugin history mode", () => {
  it("disables input and guards suggestion, selection, and submission paths", async () => {
    const sendMessage = vi.fn(async () => undefined);
    const model = parseAppUIModel({
      version: "2",
      root: { type: "slot", id: "sender-node", slotId: "sender" },
      pluginInstances: {
        provider: {
          id: "provider",
          pluginId: "test-history-provider",
          enabled: true,
        },
        sender: {
          id: "sender",
          pluginId: "agent-composer",
          enabled: true,
          mount: { slotId: "sender" },
        },
      },
    });
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <AgentUIRoot>
          <PluginRuntimeFixture
            actions={{
              sendMessage,
              resumeInterrupts: async () => undefined,
              startNewConversation: async () => undefined,
              abortRun: () => undefined,
              updateInstanceProps: () => undefined,
            }}
            conversation={{ id: "live" }}
            executions={[]}
            interrupts={[]}
            messages={[]}
            model={model}
            registry={createPluginRegistry([historyProvider, agentComposerPlugin])}
            run={{ status: "idle" }}
            state={{}}
          />
        </AgentUIRoot>,
      );
    });

    const textarea = container.querySelector("textarea") as HTMLTextAreaElement;
    expect(textarea.disabled).toBe(true);
    expect(textarea.placeholder).toContain("历史会话为只读");
    const valueSetter = Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value",
    )?.set;
    await act(async () => {
      valueSetter?.call(textarea, "/");
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
      textarea.dispatchEvent(new KeyboardEvent("keydown", {
        key: "Enter",
        bubbles: true,
        cancelable: true,
      }));
    });
    expect(container.querySelector('[role="listbox"]')).toBeNull();
    expect(sendMessage).not.toHaveBeenCalled();
    await act(async () => root.unmount());
    container.remove();
  });

  it("keeps every history-mode controller mutation path inert", async () => {
    const onValueChange = vi.fn();
    const onSubmit = vi.fn();
    let controller: ComposerSuggestionsController | undefined;

    function ControllerFixture() {
      controller = useComposerSuggestions({
        binding: {
          value: "",
          onValueChange,
          running: false,
          disabled: true,
          placeholder: "History",
          onSubmit,
          onStop: () => undefined,
          historyMode: true,
          runStatus: "idle",
          error: undefined,
        },
        suggestions: [{ id: "summary", label: "Summary", value: "Summarize" }],
      });
      return null;
    }

    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => root.render(<ControllerFixture />));
    if (controller === undefined) throw new Error("Controller was not created");
    const readyController = controller;
    await act(async () => {
      readyController.onValueChange("/");
      readyController.onOpenChange(true);
      readyController.onSelect(
        { id: "summary", label: "Summary", value: "Summarize" },
        0,
      );
      readyController.onSubmit("must not send");
    });
    expect(readyController.open).toBe(false);
    expect(onValueChange).not.toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();
    await act(async () => root.unmount());
    container.remove();
  });
});
