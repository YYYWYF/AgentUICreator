// @vitest-environment jsdom
import { createHash } from "node:crypto";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useAui, useAuiState, type AssistantRuntime } from "@assistant-ui/react";
import type { RunAgentInput } from "@ag-ui/client";
import { $getRoot, $isTextNode, getNearestEditorFromDOMNode, HISTORY_PUSH_TAG, KEY_BACKSPACE_COMMAND, KEY_DELETE_COMMAND, KEY_ENTER_COMMAND, UNDO_COMMAND } from "lexical";
import { afterEach, expect, it, vi } from "vitest";
import { createDefaultAgentUIPresetRegistry } from "@agent-ui/bootstrap";
import { ConversationRuntimeProvider } from "@agent-ui/runtime-conversation";
import { CancellationAwareHttpAgent } from "../../runtime-conversation/src/compatibility/cancellation-aware-http-agent.js";
import { AgentUIRoot, ConversationThread, ConversationCanonicalUserEditComposer } from "../src/index.js";
import { ConversationUserEditLexicalComposer } from "../src/lexical.js";
import { parseAppUIModel, collectAppUIPluginLocations, type AppUIModel } from "../../project-control/src/framework/contracts/app-ui-model";
import { compileAppUIModel } from "../../project-control/src/framework/contracts/app-ui-compiler";
import { applyAppUIOperations, type AppUIOperation } from "../../project-control/src/project/app-ui-operations";
import { parseUIPluginManifest, type UIPluginDefinition } from "../../project-control/src/framework/contracts/ui-plugin";
import { PluginRuntimeFixture } from "../../project-control/tests/support/agent-runtime-fixture";
import { createPluginRegistry, createPluginCompositionCatalog, usePluginRenderScope } from "../../source-registry/registry/items/foundation-core-runtime/files/runtime/plugins/index";
import { ConversationAdapter } from "../../source-registry/registry/items/foundation-core-adapters/files/agent-ui/conversation/ConversationAdapter";
import { AGENT_UI_LOCALES } from "../../source-registry/registry/items/foundation-core-adapters/files/agent-ui/i18n/locale-registry";
import surfaceManifest from "../../source-registry/registry/items/plugin-conversation-surface/files/plugins/conversation-surface/manifest.json";
import { assistantUiLexicalEditComposerPlugin } from "../../source-registry/registry/items/plugin-assistant-ui-lexical-edit-composer/files/plugins/assistant-ui-lexical-edit-composer/definition";
import { assistantUiComposerPlugin } from "../../source-registry/registry/items/plugin-assistant-ui-composer/files/plugins/assistant-ui-composer/definition";
import { assistantUiLexicalComposerInputPlugin } from "../../source-registry/registry/items/plugin-assistant-ui-lexical-composer-input/files/plugins/assistant-ui-lexical-composer-input/definition";
import { resolveDirectiveContexts } from "../../mock-agent/src/context/directive-context.js";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const directive = ":user[张三]{name=employee_84721}";
const draft = directive + " 是谁？";
const editId = "assistant-ui-lexical-edit-composer-main";
const mainId = "assistant-ui-lexical-composer-input-main";
const roots: Root[] = [];
afterEach(async () => {
  await act(async () => { for (const root of roots.splice(0)) root.unmount(); });
  document.body.replaceChildren(); vi.restoreAllMocks(); vi.unstubAllGlobals();
});
async function until(predicate: () => boolean) {
  for (let i = 0; i < 100; i++) {
    if (predicate()) return;
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });
  }
  throw new Error("Timed out waiting for message edit composer");
}
async function mount({ preset = "assistant", text = draft, disabled = false, holdRun = false, seam }: {
  preset?: "assistant" | "embedded" | "platform"; text?: string; disabled?: boolean; holdRun?: boolean; seam?: "canonical" | "custom";
} = {}) {
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  Object.defineProperty(HTMLElement.prototype, "scrollTo", { configurable: true, value() {} });
  Object.defineProperty(Range.prototype, "getBoundingClientRect", { configurable: true, value: () => new DOMRect() });
  Object.defineProperty(Range.prototype, "getClientRects", { configurable: true, value: () => [] });
  const requests: RunAgentInput[] = [];
  const scopes: unknown[] = [];
  let finishRun = () => {};
  let runtime!: AssistantRuntime;
  const agentFactory = () => new CancellationAwareHttpAgent({ url: "http://example.test/agent", fetch: async (_url, init) => {
    const input = JSON.parse(String(init.body)) as RunAgentInput; requests.push(input);
    if (holdRun) return new Response(new ReadableStream({ start(controller) {
      const push = (event: unknown) => controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`));
      push({ type: "RUN_STARTED", threadId: input.threadId, runId: input.runId });
      finishRun = () => { push({ type: "RUN_FINISHED", threadId: input.threadId, runId: input.runId }); controller.close(); };
    } }), { headers: { "Content-Type": "text/event-stream" } });
    return new Response([
      { type: "RUN_STARTED", threadId: input.threadId, runId: input.runId },
      { type: "RUN_FINISHED", threadId: input.threadId, runId: input.runId },
    ].map(event => `data: ${JSON.stringify(event)}\n\n`).join(""), { headers: { "Content-Type": "text/event-stream" } });
  } });
  const quote = { text: "原引用", messageId: "quoted" };
  const binding = {
    getThreadId: () => "edit-history", subscribe: () => () => {}, createNewThread: async () => "new",
    getThreadIsDisabled: () => disabled,
    loadThread: async () => ({ messages: [{ id: "user", role: "user" as const,
      content: [{ type: "text" as const, text }], createdAt: new Date(0), metadata: { custom: { quote } } }] }),
  };
  const shipped = createDefaultAgentUIPresetRegistry(parseAppUIModel).get(`${preset}/default`).createAppUIModel();
  const surface = structuredClone(collectAppUIPluginLocations(shipped).find(entry => entry.plugin.pluginId === "conversation-surface")!.plugin);
  const composer = surface.slots!.composer![0]!;
  // Keep the shipped edit Slot and primary input; unrelated business services
  // and visual features are outside this deterministic Runtime integration.
  composer.slots = { input: composer.slots!.input! };
  surface.slots = { userEditComposer: surface.slots!.userEditComposer!, composer: [composer] };
  const originalEdit = structuredClone(surface.slots.userEditComposer![0]!);
  let model: AppUIModel = parseAppUIModel({ root: { type: "slot", plugins: [surface] } });
  function ScopedProbe() {
    scopes.push({ scope: usePluginRenderScope(), text: useAuiState(s => s.composer.text) });
    return <ConversationUserEditLexicalComposer />;
  }
  const hostDefinition: UIPluginDefinition = {
    manifest: parseUIPluginManifest(surfaceManifest), optionalInject: ["agent-ui.theme"],
    Component: ({ renderScopedSlot, renderSlot }) => <ConversationAdapter labels={AGENT_UI_LOCALES["zh-CN"].conversation}
      renderScopedSlot={renderScopedSlot} composer={renderSlot("composer", null)} />,
  };
  const registry = createPluginRegistry([hostDefinition, { ...assistantUiLexicalEditComposerPlugin, Component: ScopedProbe }, assistantUiComposerPlugin, assistantUiLexicalComposerInputPlugin]);
  const catalog = createPluginCompositionCatalog(registry);
  function Capture() { runtime = useAui().threads.__internal_getAssistantRuntime!(); return null; }
  function CustomEdit() { return <div data-testid="custom-edit"><ConversationCanonicalUserEditComposer /></div>; }
  const container = document.createElement("div"); document.body.append(container);
  const root = createRoot(container); roots.push(root);
  const render = async () => {
    await act(async () => root.render(<ConversationRuntimeProvider endpoint="http://example.test/agent" threadBinding={binding} unstable_agentFactory={agentFactory}>
      <AgentUIRoot theme="violet"><Capture />{seam ? <ConversationThread labels={AGENT_UI_LOCALES["zh-CN"].conversation}
        components={seam === "custom" ? { UserEditComposer: CustomEdit } : {}} /> :
        <PluginRuntimeFixture model={compileAppUIModel(model, catalog)} registry={registry}
          appUIModelHash={createHash("sha256").update(JSON.stringify(model)).digest("hex")}
          actions={{ sendMessage: async () => {}, resumeInterrupts: async () => {}, startNewConversation: async () => {}, abortRun: () => {} }}
          conversation={{ id: "edit-history" }} messages={[]} state={null} run={{ status: "idle" }} executions={[]} interrupts={[]} />}
      </AgentUIRoot></ConversationRuntimeProvider>));
  };
  await render(); await until(() => !runtime.thread.getState().isLoading);
  const mutate = async (operation: AppUIOperation) => { model = applyAppUIOperations(model, [operation]); await render(); };
  const shell = () => container.querySelector<HTMLElement>('[data-slot="agent-ui-edit-composer"]')!;
  const textarea = () => shell()?.querySelector<HTMLTextAreaElement>("textarea") ?? null;
  const textbox = () => shell()?.querySelector<HTMLElement>('[role="textbox"]') ?? null;
  const chip = () => shell()?.querySelector('[data-directive-id="employee_84721"]') ?? null;
  const editor = () => getNearestEditorFromDOMNode(textbox()!)!;
  const begin = async () => {
    await act(async () => container.querySelector('[data-slot="aui_user-message-root"]')!.dispatchEvent(new MouseEvent('mouseenter')));
    const edit = container.querySelector<HTMLButtonElement>('.aui-user-action-edit')!;
    await act(async () => edit.click()); await until(() => shell() !== null);
  };
  const button = async (label: string) => {
    const target = [...shell().querySelectorAll<HTMLButtonElement>('button')].find(node => node.textContent === label)!;
    await act(async () => target.click());
  };
  return { container, runtime, requests, quote, scopes, finishRun: () => finishRun(), begin, button, textarea, textbox, editor, shell, chip, mutate, originalEdit, surfaceId: surface.id };
}

it.each(["canonical", "custom"] as const)("keeps the %s edit seam and localized textarea available", async seam => {
  const fixture = await mount({ seam }); await fixture.begin();
  expect(fixture.textarea()!.value).toBe(draft);
  expect(fixture.textarea()!.getAttribute("aria-label")).toBe("编辑消息");
  expect(fixture.shell().textContent).toContain("取消"); expect(fixture.shell().textContent).toContain("更新");
  expect(fixture.container.querySelector('[data-testid="custom-edit"]') !== null).toBe(seam === "custom");
});

it.each(["assistant", "embedded", "platform"] as const)("preserves active message draft through disable/enable and remove/reinstall in %s", async preset => {
  const f = await mount({ preset }); await f.begin(); await until(() => f.chip() !== null);
  const composer = f.runtime.thread.getMessageById("user").composer;
  expect(f.scopes).toContainEqual({ scope: { kind: "conversation.user-edit-composer", value: {} }, text: draft });
  expect(f.chip()!.textContent).toBe("@张三");
  await act(async () => composer.setText("修改 " + draft));
  for (const operation of ["disable", "remove"] as const) {
    await f.mutate(operation === "disable" ? { type: "set_plugin_enabled", instanceId: editId, enabled: false } : { type: "remove_plugin", instanceId: editId });
    await until(() => f.textarea() !== null && f.textbox() === null);
    expect(f.textarea()!.value).toBe("修改 " + draft);
    expect(f.runtime.thread.getMessageById("user").composer.getState()).toEqual(composer.getState());
    expect(composer.getState().isEditing).toBe(true);
    expect(f.container.querySelector('[data-slot="aui_composer-shell"] .aui-lexical-input')).not.toBeNull();
    await f.mutate(operation === "disable" ? { type: "set_plugin_enabled", instanceId: editId, enabled: true } : {
      type: "insert_plugin", plugin: f.originalEdit, target: { type: "plugin_slot", parentInstanceId: f.surfaceId, slot: "userEditComposer" },
    });
    await until(() => f.chip() !== null && f.textarea() === null);
    expect(composer.getState().text).toBe("修改 " + draft);
  }
  await f.mutate({ type: "remove_plugin", instanceId: mainId });
  await until(() => f.container.querySelector('[data-slot="aui_composer-shell"] textarea') !== null);
  expect(f.chip()).not.toBeNull(); expect(f.requests).toHaveLength(0);
});

it.each(["user", "resource", "file", "document", "command"])("reconstructs existing %s directives with stable identities", async type => {
  const f = await mount({ text: `:${type}[对象]{name=stable_id}` }); await f.begin();
  await until(() => f.shell().querySelector('[data-directive-id="stable_id"]') !== null);
  expect(f.shell().querySelector('[data-directive-id="stable_id"]')!.textContent).toBe(`${type === "command" ? "/" : "@"}对象`);
  expect(f.runtime.thread.getMessageById("user").composer.getState().text).toBe(`:${type}[对象]{name=stable_id}`);
});

it.each([":legacy[ABC]{name=123}", ":unknown[X]"])("keeps unknown directives verbatim in the textarea: %s", async unknown => {
  const text = draft + " " + unknown;
  const f = await mount({ text }); await f.begin();
  expect(f.textarea()!.value).toBe(text); expect(f.textbox()).toBeNull();
  await f.button("更新"); await until(() => f.requests.length === 1);
  expect(f.requests[0]!.messages.find(message => message.role === "user")!.content).toBe(text);
});

it("edits ordinary text, sends canonical AG-UI text and resolves the same employee on the new branch", async () => {
  const f = await mount(); await f.begin(); await until(() => f.chip() !== null);
  expect(f.textbox()!.getAttribute("aria-label")).toBe("编辑消息");
  // Keyboard editing starts with the editable element focused.
  await act(async () => f.textbox()!.focus());
  expect(document.activeElement).toBe(f.textbox());
  const expected = directive + "\n负责什么？";
  await act(async () => f.editor().update(() => {
    const last = $getRoot().getLastDescendant();
    if (!$isTextNode(last)) throw new Error("Expected trailing ordinary text");
    last.setTextContent("\n负责什么？");
  }, { discrete: true }));
  await until(() => f.runtime.thread.getMessageById("user").composer.getState().text === expected);
  await f.button("更新"); await until(() => f.requests.length === 1 && !f.runtime.thread.getState().isRunning);
  const input = f.requests[0]!;
  expect(input.messages.find(message => message.role === "user")!.content).toBe(expected);
  expect(JSON.stringify(input)).not.toContain("directive-node"); expect(JSON.stringify(input)).not.toContain('"editorState"');
  const resolver = vi.fn(async (reference: { id: string }) => ({ description: "employee", value: reference.id }));
  await resolveDirectiveContexts(input, { user: resolver }, { signal: new AbortController().signal });
  expect(resolver).toHaveBeenCalledWith({ type: "user", label: "张三", id: "employee_84721" }, expect.anything());
  expect(f.container.querySelector('[data-slot="aui_user-message-root"] [data-directive-id="employee_84721"]')!.textContent).toBe("@张三");
  const updated = f.runtime.thread.getState().messages.find(message => message.role === "user")!;
  expect(f.runtime.thread.getMessageById(updated.id).getState().branchCount).toBeGreaterThan(1);
  expect(f.container.querySelector('[data-slot="aui_user-message-root"] .aui-branch-picker-root')).not.toBeNull();
  await f.begin(); await until(() => f.chip() !== null);
});

it("keeps Cancel local and the original message and directive unchanged", async () => {
  const f = await mount(); await f.begin(); await until(() => f.chip() !== null);
  await act(async () => f.runtime.thread.getMessageById("user").composer.setText(directive + " 新问题"));
  await f.button("取消");
  expect(f.requests).toHaveLength(0);
  expect(f.runtime.thread.getMessageById("user").composer.getState().isEditing).toBe(false);
  expect(f.runtime.thread.getMessageById("user").getState().content).toEqual([{ type: "text", text: draft }]);
  await f.begin(); await until(() => f.chip() !== null);
  expect(f.runtime.thread.getMessageById("user").composer.getState().text).toBe(draft);
});

it.each(["backward", "forward"] as const)("deletes atomically %s, restores with Undo, and omits deleted identity from transport", async direction => {
  const f = await mount({ text: directive }); await f.begin(); await until(() => f.chip() !== null);
  const composer = f.runtime.thread.getMessageById("user").composer;
  // Separate the history entry from initial SyncPlugin initialization.
  await act(async () => f.editor().update(() => $getRoot().selectEnd(), { discrete: true, tag: HISTORY_PUSH_TAG }));
  const remove = async () => { await act(async () => {
    f.editor().update(() => direction === "backward" ? $getRoot().selectEnd() : $getRoot().selectStart(), { discrete: true });
    f.editor().dispatchCommand(direction === "backward" ? KEY_BACKSPACE_COMMAND : KEY_DELETE_COMMAND,
      new KeyboardEvent("keydown", { key: direction === "backward" ? "Backspace" : "Delete" }));
  }); };
  await remove(); await until(() => composer.getState().text === "");
  await act(async () => { f.editor().dispatchCommand(UNDO_COMMAND, undefined); });
  await until(() => composer.getState().text === directive && f.chip() !== null);
  await remove(); await until(() => composer.getState().text === "");
  await act(async () => composer.setText("普通问题")); await f.button("更新");
  await until(() => f.requests.length === 1);
  expect(JSON.stringify(f.requests[0])).not.toContain("employee_84721");
});

it("keeps IME Enter local and Shift+Enter multiline in the message-scoped draft", async () => {
  const f = await mount(); await f.begin(); await until(() => f.chip() !== null);
  await act(async () => {
    f.editor().update(() => $getRoot().selectEnd(), { discrete: true });
    f.editor().dispatchCommand(KEY_ENTER_COMMAND, new KeyboardEvent("keydown", { key: "Enter", isComposing: true }));
  });
  expect(f.requests).toHaveLength(0);
  await act(async () => { f.editor().dispatchCommand(KEY_ENTER_COMMAND, new KeyboardEvent("keydown", { key: "Enter", shiftKey: true })); });
  await until(() => f.runtime.thread.getMessageById("user").composer.getState().text.includes("\n"));
  expect(f.requests).toHaveLength(0); expect(f.chip()).not.toBeNull();
});

it("retains the canonical Quote metadata semantics after rich Update", async () => {
  const results: unknown[] = [];
  for (const seam of ["canonical", undefined] as const) {
    const f = await mount(seam === undefined ? {} : { seam }); await f.begin();
    await act(async () => f.runtime.thread.getMessageById("user").composer.setText(directive + " 更新问题"));
    await f.button("更新"); await until(() => f.requests.length === 1 && !f.runtime.thread.getState().isRunning);
    results.push(f.runtime.thread.getState().messages.find(message => message.role === "user")!.metadata.custom);
  }
  expect(results[1]).toEqual(results[0]);
});

it("keeps readonly history outside the editing lifecycle", async () => {
  const f = await mount({ disabled: true });
  const edit = f.container.querySelector<HTMLButtonElement>('.aui-user-action-edit');
  expect(edit === null || edit.disabled).toBe(true);
  expect(f.shell()).toBeNull(); expect(f.requests).toHaveLength(0);
});

it("preserves the existing Edit action visibility during an active run", async () => {
  const f = await mount({ holdRun: true });
  await act(async () => { f.runtime.thread.composer.setText("下一轮"); f.runtime.thread.composer.send(); });
  await until(() => f.requests.length === 1 && f.runtime.thread.getState().isRunning);
  expect(f.container.querySelector('.aui-user-action-edit')).toBeNull();
  expect(f.shell()).toBeNull();
  await act(async () => f.finishRun());
  await until(() => !f.runtime.thread.getState().isRunning);
  // Upstream autohide=not-last requires hovering a user message after a reply.
  await act(async () => f.container.querySelector('[data-slot="aui_user-message-root"]')!.dispatchEvent(new MouseEvent('mouseenter')));
  await until(() => f.container.querySelector('.aui-user-action-edit') !== null);
  expect(f.container.querySelector('.aui-user-action-edit')).not.toBeNull();
});
