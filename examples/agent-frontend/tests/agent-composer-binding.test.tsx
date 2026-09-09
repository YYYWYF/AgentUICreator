// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AgentUIRoot } from "../agent-ui/foundation/AgentUIRoot";
import { parseAppUIModel } from "../framework/contracts/app-ui-model";
import type {
  AgentExecution,
  AgentInterrupt,
  AgentRunState,
  AgentUserInput,
} from "../framework/contracts/ui-plugin";
import { agentComposerPlugin } from "../plugins/agent-composer/definition";
import { createPluginRegistry } from "../runtime/plugins";
import { PluginRuntimeFixture } from "./agent-runtime-fixture";

const model = parseAppUIModel({
  version: "2",
  root: { type: "slot", id: "sender-node", slotId: "sender" },
  pluginInstances: {
    sender: {
      id: "sender",
      pluginId: "agent-composer",
      enabled: true,
      mount: { slotId: "sender" },
    },
  },
});

interface RenderSenderOptions {
  run?: AgentRunState;
  executions?: AgentExecution[];
  interrupts?: AgentInterrupt[];
  sendMessage?: (input: string | AgentUserInput) => Promise<void>;
  abortRun?: () => void;
}

const mountedRoots: Root[] = [];

async function renderSender({
  run = { status: "idle" },
  executions = [],
  interrupts = [],
  sendMessage = async () => undefined,
  abortRun = () => undefined,
}: RenderSenderOptions = {}) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  mountedRoots.push(root);
  await act(async () => {
    root.render(
      <AgentUIRoot>
        <PluginRuntimeFixture
          actions={{
            sendMessage,
            resumeInterrupts: async () => undefined,
            startNewConversation: async () => undefined,
            abortRun,
            updateInstanceProps: () => undefined,
          }}
          conversation={{ id: "live" }}
          executions={executions}
          interrupts={interrupts}
          messages={[]}
          model={model}
          registry={createPluginRegistry([agentComposerPlugin])}
          run={run}
          state={{}}
        />
      </AgentUIRoot>,
    );
  });
  return {
    container,
    textarea: container.querySelector("textarea") as HTMLTextAreaElement,
  };
}

async function updateInput(textarea: HTMLTextAreaElement, value: string) {
  await act(async () => {
    const valueSetter = Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value",
    )?.set;
    valueSetter?.call(textarea, value);
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function pressKey(
  textarea: HTMLTextAreaElement,
  key: string,
  options: { isComposing?: boolean; keyCode?: number } = {},
) {
  let event!: KeyboardEvent;
  await act(async () => {
    event = new KeyboardEvent("keydown", {
      key,
      bubbles: true,
      cancelable: true,
    });
    if (options.isComposing === true) {
      Object.defineProperty(event, "isComposing", { value: true });
    }
    if (options.keyCode !== undefined) {
      Object.defineProperty(event, "keyCode", { value: options.keyCode });
    }
    textarea.dispatchEvent(event);
  });
  return event;
}

afterEach(async () => {
  await act(async () => {
    for (const root of mountedRoots.splice(0)) root.unmount();
  });
  document.body.replaceChildren();
});

describe("AgentComposer runtime binding", () => {
  it("preserves the complete running-state aggregation", async () => {
    const pendingTool: AgentExecution = {
      type: "tool",
      id: "tool-1",
      producer: { type: "root" },
      name: "lookup",
      status: "awaiting-result",
      arguments: "{}",
    };
    const interrupt: AgentInterrupt = {
      id: "interrupt-1",
      producer: { type: "root" },
      reason: "approval",
    };
    const cases: RenderSenderOptions[] = [
      { run: { status: "running" } },
      { interrupts: [interrupt] },
      { executions: [pendingTool] },
    ];

    for (const options of cases) {
      const { container } = await renderSender(options);
      expect(container.querySelector('[data-slot="agent-composer"]')?.getAttribute("data-state"))
        .toBe("running");
    }

    const { container } = await renderSender();
    expect(container.querySelector('[data-slot="agent-composer"]')?.getAttribute("data-state"))
      .toBe("idle");
  });

  it("trims messages and clears the draft only after a successful send", async () => {
    const sendMessage = vi.fn(async () => undefined);
    const { textarea } = await renderSender({ sendMessage });
    await updateInput(textarea, "  hello  ");
    await pressKey(textarea, "Enter");
    await act(async () => Promise.resolve());
    expect(sendMessage).toHaveBeenCalledWith("hello");
    expect(textarea.value).toBe("");
  });

  it("preserves the draft when sendMessage rejects", async () => {
    const sendMessage = vi.fn(async () => {
      throw new Error("send failed");
    });
    const { textarea } = await renderSender({ sendMessage });
    await updateInput(textarea, "keep me");
    await pressKey(textarea, "Enter");
    await act(async () => Promise.resolve());
    expect(textarea.value).toBe("keep me");
  });

  it("navigates slash suggestions and selects with Enter without sending", async () => {
    const sendMessage = vi.fn(async () => undefined);
    const { container, textarea } = await renderSender({ sendMessage });
    textarea.focus();
    await updateInput(textarea, "/");
    const portalHost = container.querySelector("[data-agent-ui-portal-host]") as HTMLElement;
    expect(portalHost.querySelector('[role="listbox"]')).toBeInstanceOf(HTMLElement);
    expect(textarea.getAttribute("aria-expanded")).toBe("true");
    expect(textarea.getAttribute("aria-activedescendant")).toContain("suggestion-0");

    const arrowEvent = await pressKey(textarea, "ArrowDown");
    expect(arrowEvent.defaultPrevented).toBe(true);
    expect(textarea.getAttribute("aria-activedescendant")).toContain("suggestion-1");
    const enterEvent = await pressKey(textarea, "Enter");
    expect(enterEvent.defaultPrevented).toBe(true);
    expect(textarea.value).toBe("请解释最近一次工具调用的输入、输出和结论。 ");
    expect(portalHost.querySelector('[role="listbox"]')).toBeNull();
    expect(sendMessage).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(textarea);
  });

  it("wraps ArrowUp from the first suggestion to the last", async () => {
    const { textarea } = await renderSender();
    await updateInput(textarea, "/");
    await pressKey(textarea, "ArrowUp");
    expect(textarea.getAttribute("aria-activedescendant")).toContain("suggestion-1");
  });

  it("closes suggestions on Escape without changing or sending the draft", async () => {
    const sendMessage = vi.fn(async () => undefined);
    const { container, textarea } = await renderSender({ sendMessage });
    await updateInput(textarea, "/");
    const event = await pressKey(textarea, "Escape");
    expect(event.defaultPrevented).toBe(true);
    expect(textarea.value).toBe("/");
    expect(container.querySelector('[role="listbox"]')).toBeNull();
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it.each([
    { isComposing: true },
    { keyCode: 229 },
  ])("ignores IME confirmation Enter while suggestions are open", async (ime) => {
    const sendMessage = vi.fn(async () => undefined);
    const { container, textarea } = await renderSender({ sendMessage });
    await updateInput(textarea, "/");
    await pressKey(textarea, "Enter", ime);
    expect(textarea.value).toBe("/");
    expect(container.querySelector('[role="listbox"]')).toBeInstanceOf(HTMLElement);
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("binds the running action to abortRun exactly once", async () => {
    const abortRun = vi.fn();
    const { container } = await renderSender({
      run: { status: "running" },
      abortRun,
    });
    await act(async () => {
      (container.querySelector('[data-slot="agent-composer-stop"]') as HTMLButtonElement).click();
    });
    expect(abortRun).toHaveBeenCalledOnce();
  });

  it("projects Runtime errors through the plugin error banner", async () => {
    const { container } = await renderSender({
      run: {
        status: "error",
        error: { message: "Runtime send failed" },
      },
    });
    const alert = container.querySelector('[data-slot="agent-composer-error"]');
    expect(alert?.getAttribute("role")).toBe("alert");
    expect(alert?.textContent).toContain("Runtime send failed");
  });
});
