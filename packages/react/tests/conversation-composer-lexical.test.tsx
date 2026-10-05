// @vitest-environment jsdom
import { useAui, type AssistantRuntime } from "@assistant-ui/react";
import type { RunAgentInput } from "@ag-ui/client";
import { $getRoot, getNearestEditorFromDOMNode, KEY_BACKSPACE_COMMAND, KEY_DELETE_COMMAND, KEY_ENTER_COMMAND, UNDO_COMMAND } from "lexical";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { ConversationRuntimeProvider, createEphemeralConversationThreadBinding } from "@agent-ui/runtime-conversation";
import { CancellationAwareHttpAgent } from "../../runtime-conversation/src/compatibility/cancellation-aware-http-agent.js";
import { AgentUIRoot, ConversationThread, ConversationCanonicalComposer, ConversationComposerTextareaInput, ConversationComposerMentionTrigger, ConversationComposerCommandTrigger, type ConversationTriggerLabels } from "../src/index.js";
import { ConversationComposerLexicalInput } from "../src/lexical.js";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const labels: ConversationTriggerLabels = { suggestions: "Suggestions", back: "Back", empty: "No matches", loading: "Loading", searchFailed: "Search failed", retry: "Retry", commandFailed: "Command failed", invalidItem: "Invalid item" };
const directive = ":user[张三]{name=employee_84721}";
let root: Root | undefined;
afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function until(predicate: () => boolean) {
  for (let i = 0; i < 100; i++) {
    if (predicate()) return;
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 5)); });
  }
  throw new Error("Timed out waiting for Lexical Composer");
}
async function mount(disabled = false) {
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  Object.defineProperty(HTMLElement.prototype, "scrollTo", { configurable: true, value() {} });
  // Lexical measures the browser selection when reconciling a focused editor.
  Object.defineProperty(Range.prototype, "getBoundingClientRect", { configurable: true, value: () => new DOMRect() });
  Object.defineProperty(Range.prototype, "getClientRects", { configurable: true, value: () => [] });
  let runtime!: AssistantRuntime;
  let rich = true;
  const requests: RunAgentInput[] = [];
  const execute = vi.fn();
  const search = vi.fn(async () => [{ id: "employee_84721", type: "user", label: "张三" }]);
  const mentionSource = { cacheKey: "roster", search };
  const commandSource = { subscribe: () => () => {}, getSnapshot: () => commands };
  const commands = [
    { id: "new", label: "新会话", mode: "action" as const, execute },
    { id: "summarize", label: "总结", mode: "directive" as const },
  ];
  const agentFactory = () => new CancellationAwareHttpAgent({ url: "http://example.test/agent", fetch: async (_url, init) => {
    const input = JSON.parse(String(init.body)) as RunAgentInput;
    requests.push(input);
    return new Response([{ type: "RUN_STARTED", threadId: input.threadId, runId: input.runId }, { type: "RUN_FINISHED", threadId: input.threadId, runId: input.runId }].map(event => `data: ${JSON.stringify(event)}\n\n`).join(""), { headers: { "Content-Type": "text/event-stream" } });
  } });
  const binding = { ...createEphemeralConversationThreadBinding(), getThreadIsDisabled: () => disabled };
  function Capture() { runtime = useAui().threads.__internal_getAssistantRuntime!(); return null; }
  const host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  const render = () => root!.render(
    <ConversationRuntimeProvider endpoint="http://example.test/agent" threadBinding={binding} unstable_agentFactory={agentFactory}>
      <AgentUIRoot theme="violet"><Capture /><ConversationThread autoFocus={false} composer={
        <ConversationCanonicalComposer autoFocus={false} placeholder="写消息" inputAriaLabel="消息输入"
          beforeInput={<div data-testid="quote-preview">Quote</div>}
          // SlotRuntime returns a node even when empty: test its lazy fallback.
          input={<div data-testid="input-slot">{rich ? <ConversationComposerLexicalInput /> : <ConversationComposerTextareaInput />}</div>}
          triggers={<><ConversationComposerMentionTrigger source={mentionSource} labels={labels} debounceMs={1} />
            <ConversationComposerCommandTrigger source={commandSource} labels={labels} /></>} />
      } /></AgentUIRoot>
    </ConversationRuntimeProvider>,
  );
  await act(async () => render());
  await until(() => !runtime.thread.getState().isLoading);
  const textbox = () => host.querySelector<HTMLElement>('[role="textbox"]')!;
  const editor = () => getNearestEditorFromDOMNode(textbox())!;
  const type = async (text: string) => {
    await act(async () => runtime.thread.composer.setText(text));
    await act(async () => {
      textbox().focus();
      editor().update(() => $getRoot().selectEnd(), { discrete: true });
    });
  };
  const choose = async (label: string) => {
    await until(() => [...host.querySelectorAll('[role="option"]')].some(element => element.textContent!.includes(label)));
    const option = [...host.querySelectorAll<HTMLElement>('[role="option"]')].find(element => element.textContent!.includes(label))!;
    await act(async () => option.click());
  };
  const remove = async () => { rich = false; await act(async () => render()); };
  return { host, runtime, requests, execute, search, textbox, editor, type, choose, remove };
}

it("renders a selected Mention as a chip while sending the unchanged directive over AG-UI", async () => {
  const { host, runtime, requests, search, type, choose } = await mount();
  await type("@张"); await choose("张三");
  await until(() => host.querySelector('[data-directive-id="employee_84721"]') !== null);
  const chip = host.querySelector('[data-directive-id="employee_84721"]')!;
  expect(chip.textContent).toBe("@张三");
  expect(chip.getAttribute("data-directive-type")).toBe("user");
  expect(chip.closest('[contenteditable="false"]')).not.toBeNull();
  expect(search).toHaveBeenCalled();
  expect(runtime.thread.composer.getState().text).toBe(directive + " ");
  expect(requests).toHaveLength(0);
  await act(async () => runtime.thread.composer.send());
  await until(() => requests.length === 1 && !runtime.thread.getState().isRunning);
  expect(requests[0]!.messages.find(message => message.role === "user")!.content).toBe(directive + " ");
  expect(host.querySelector('[data-slot="aui_user-message-root"] [data-directive-id="employee_84721"]')?.textContent).toBe("张三");
});

it("keeps Slash actions out of the draft and reconstructs Slash directives as chips", async () => {
  const { host, runtime, requests, execute, type, choose } = await mount();
  await type("/new"); await choose("新会话");
  await until(() => execute.mock.calls.length === 1);
  expect(runtime.thread.composer.getState().text).toBe("");
  expect(host.querySelector('.agent-ui-composer-directive-chip')).toBeNull();
  expect(requests).toHaveLength(0);
  await type("/sum"); await choose("总结");
  await until(() => host.querySelector('[data-directive-id="summarize"]') !== null);
  expect(host.querySelector('[data-directive-id="summarize"]')!.textContent).toBe("/总结");
  expect(runtime.thread.composer.getState().text).toBe(":command[总结]{name=summarize} ");
  expect(requests).toHaveLength(0);
});

it("shares labels, preserves Quote placement and falls back without losing Runtime text", async () => {
  const { host, runtime, textbox, remove } = await mount();
  expect(textbox().getAttribute("aria-label")).toBe("消息输入");
  expect(textbox().getAttribute("aria-placeholder")).toBe("写消息");
  await act(async () => runtime.thread.composer.setText("普通文字 " + directive));
  await until(() => host.querySelector('[data-directive-id="employee_84721"]') !== null);
  expect(host.querySelector('[data-testid="quote-preview"]')!.compareDocumentPosition(textbox()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  await remove();
  const input = host.querySelector("textarea")!;
  expect(input.value).toBe("普通文字 " + directive);
  expect(input.getAttribute("aria-label")).toBe("消息输入");
  expect(input.placeholder).toBe("写消息");
  expect(host.querySelector('.aui-lexical-input')).toBeNull();
  await act(async () => {
    runtime.thread.composer.setText("@张");
    input.focus(); input.setSelectionRange(0, 0); document.dispatchEvent(new Event("selectionchange"));
    input.setSelectionRange(2, 2); document.dispatchEvent(new Event("selectionchange"));
    input.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
  });
  await until(() => host.querySelector('[role="option"]') !== null);
});

it.each(["backward", "forward"] as const)("deletes a directive atomically %s", async direction => {
  const { runtime, editor, type } = await mount();
  await type(directive);
  await act(async () => {
    editor().update(() => direction === "backward" ? $getRoot().selectEnd() : $getRoot().selectStart(), { discrete: true });
    editor().dispatchCommand(direction === "backward" ? KEY_BACKSPACE_COMMAND : KEY_DELETE_COMMAND,
      new KeyboardEvent("keydown", { key: direction === "backward" ? "Backspace" : "Delete" }));
  });
  await until(() => runtime.thread.composer.getState().text === "");
});

it("does not leave partial directives after Undo or an external draft clear", async () => {
  const { runtime, host, editor, type, choose } = await mount();
  await type("@张"); await choose("张三");
  await act(async () => { editor().dispatchCommand(UNDO_COMMAND, undefined); });
  const text = runtime.thread.composer.getState().text;
  expect(text.includes(":user[") && !text.includes("{name=employee_84721}")).toBe(false);
  await act(async () => runtime.thread.composer.setText(""));
  await until(() => host.querySelector('.agent-ui-composer-directive-chip') === null);
});

it("keeps readonly threads noneditable and composition Enter out of transport", async () => {
  const { textbox, requests } = await mount(true);
  expect(textbox().getAttribute("contenteditable")).toBe("false");
  await act(async () => textbox().dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", isComposing: true, bubbles: true })));
  expect(requests).toHaveLength(0);
});

it("keeps composition Enter local, inserts Shift+Enter newlines and sends on ordinary Enter", async () => {
  const { runtime, editor, requests, type } = await mount();
  await type("你好");
  await act(async () => {
    editor().dispatchCommand(KEY_ENTER_COMMAND, new KeyboardEvent("keydown", { key: "Enter", isComposing: true }));
  });
  expect(requests).toHaveLength(0);
  await act(async () => {
    editor().dispatchCommand(KEY_ENTER_COMMAND, new KeyboardEvent("keydown", { key: "Enter", shiftKey: true }));
  });
  await until(() => runtime.thread.composer.getState().text.includes("\n"));
  expect(requests).toHaveLength(0);
  await act(async () => {
    editor().dispatchCommand(KEY_ENTER_COMMAND, new KeyboardEvent("keydown", { key: "Enter" }));
  });
  await until(() => requests.length === 1);
});
