// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { AssistantRuntimeProvider, useLocalRuntime, type AssistantRuntime } from "@assistant-ui/react";
import { afterEach, expect, it, vi } from "vitest";
import { AgentUILocaleProvider, ConversationThread, ConversationThinkingIndicator } from "@za38.03/agent-ui-plugins";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | undefined;
afterEach(async () => { await act(async () => root?.unmount()); root = undefined; document.body.replaceChildren(); vi.restoreAllMocks(); });

it.each([false, true])("reasoningVisible=%s selects status-only or detail presentation without discarding reasoning data", async reasoningVisible => {
  let runtime!: AssistantRuntime;
  let finish = () => {};
  function Host() {
    runtime = useLocalRuntime({ async *run({ abortSignal }) {
      yield { content: [{ type: "reasoning" as const, text: "fixture reasoning content" }] };
      await new Promise<void>(resolve => { finish = resolve; abortSignal.addEventListener("abort", () => resolve(), { once: true }); });
      yield { content: [{ type: "reasoning" as const, text: "fixture reasoning content" }, { type: "text" as const, text: "fixture answer" }] };
    } });
    return <AgentUILocaleProvider locale="zh-CN"><AssistantRuntimeProvider runtime={runtime}>
      <ConversationThread composer={null} components={{ reasoningVisible,
        ThinkingIndicator: props => <ConversationThinkingIndicator {...props} /> }} />
    </AssistantRuntimeProvider></AgentUILocaleProvider>;
  }
  const container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  await act(async () => root!.render(<Host />));
  await act(async () => runtime.thread.append({ role: "user", content: [{ type: "text", text: "hello" }] }));
  expect(runtime.thread.getState().messages.at(-1)?.content).toContainEqual({ type: "reasoning", text: "fixture reasoning content" });
  if (reasoningVisible) {
    expect(container.textContent).not.toContain("正在思考");
    expect(container.querySelector('[data-slot="reasoning-root"]')).not.toBeNull();
    expect(container.querySelector('[data-slot="reasoning-trigger"]')?.getAttribute("aria-expanded")).toBe("true");
  } else {
    expect(container.textContent).toContain("正在思考");
    expect(container.textContent).not.toContain("fixture reasoning content");
    expect(container.querySelector('[data-slot="reasoning-root"]')).toBeNull();
    expect(container.querySelector('[data-slot="reasoning-trigger"]')).toBeNull();
  }
  await act(async () => { finish(); });
  expect(runtime.thread.getState().isRunning).toBe(false);
  expect(container.textContent).not.toContain("正在思考");
  if (reasoningVisible) {
    const trigger = container.querySelector<HTMLButtonElement>('[data-slot="reasoning-trigger"]')!;
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    await act(async () => trigger.click());
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(container.textContent).toContain("fixture reasoning content");
  }
});
