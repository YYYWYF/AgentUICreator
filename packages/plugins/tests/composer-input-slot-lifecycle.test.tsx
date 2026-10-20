import { createHash } from "node:crypto";
// @vitest-environment jsdom
import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { AssistantRuntimeProvider, useLocalRuntime, type AssistantRuntime } from "@assistant-ui/react";
import { createDefaultAgentUIPresetRegistry } from "@za38.03/agent-ui-operator/bootstrap";
import { afterEach, expect, it, vi } from "vitest";
import { AgentUIRoot, ConversationThread } from "../src/index.js";
import { collectAppUIPluginLocations, parseAppUIModel, type AppUIModel } from "../../operator/src/framework/contracts/app-ui-model";
import { compileAppUIModel } from "../../operator/src/framework/contracts/app-ui-compiler";
import { applyAppUIOperations, type AppUIOperation } from "../../operator/src/project/app-ui-operations";
import type { UIPluginDefinition } from "../../operator/src/framework/contracts/ui-plugin";
import { PluginRuntimeFixture } from "../../operator/tests/support/agent-runtime-fixture";
import { createPluginRegistry, createPluginCompositionCatalog } from "../resources/registry/items/foundation/core-runtime/files/runtime/plugins/index";
import { CONVERSATION_MENTION_SOURCE, CONVERSATION_COMMAND_SOURCE, createConversationCommandRegistry } from "../resources/registry/items/foundation/core-application/files/services/composer-triggers";
import { conversationComposerPlugin } from "../resources/registry/items/plugin/composer/files/plugins/composer/definition";
import { conversationLexicalComposerInputPlugin } from "../resources/registry/items/plugin/lexical-composer-input/files/plugins/lexical-composer-input/definition";
import { conversationMentionTriggerPlugin } from "../resources/registry/items/plugin/mention-trigger/files/plugins/mention-trigger/definition";
import { conversationSlashCommandTriggerPlugin } from "../resources/registry/items/plugin/slash-command-trigger/files/plugins/slash-command-trigger/definition";
import { conversationQuotePlugin } from "../resources/registry/items/plugin/conversation-quote/files/plugins/conversation-quote/definition";
import { conversationAddAttachmentActionPlugin } from "../resources/registry/items/plugin/add-attachment-action/files/plugins/add-attachment-action/definition";
import { conversationDictationActionPlugin } from "../resources/registry/items/plugin/dictation-action/files/plugins/dictation-action/definition";
import { conversationSubmitActionPlugin } from "../resources/registry/items/plugin/submit-action/files/plugins/submit-action/definition";

const inputId = "lexical-composer-input-main";
const composerId = "composer-main";
const draft = ":user[张三]{name=employee_84721} 负责什么？";
let root: Root | undefined;
afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  document.body.replaceChildren();
  vi.restoreAllMocks();
});
async function until(predicate: () => boolean) {
  for (let i = 0; i < 100; i++) {
    if (predicate()) return;
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });
  }
  throw new Error("Timed out waiting for Composer Slot reconciliation");
}

it.each(["disable", "remove"] as const)("reconciles a preset input %s and restoration through real Plugin Runtime Slots", async operation => {
  // Use the unmodified Composer subtree from the shipped assistant preset.
  // The test host supplies only the outer Thread and deterministic business data.
  const preset = createDefaultAgentUIPresetRegistry(parseAppUIModel).get("assistant/default").createAppUIModel();
  const composer = collectAppUIPluginLocations(preset).find(entry => entry.plugin.id === composerId)!.plugin;
  const originalInput = structuredClone(composer.slots!.input![0]!);
  const search = vi.fn(async () => [{ id: "employee_84721", type: "user", label: "张三" }]);
  const execute = vi.fn();
  const commands = createConversationCommandRegistry();
  commands.register({ id: "new", label: "新会话", mode: "action", execute });
  commands.register({ id: "summarize", label: "总结", mode: "directive" });
  const hostPlugin: UIPluginDefinition = {
    manifest: { id: "composer-slot-test-host", name: "Test Thread", description: "Test host", version: "1.0.0", capabilities: ["conversation-surface"],
      slots: { children: { composer: { description: "Composer", cardinality: "one", optional: true, accepts: { anyOfCapabilities: ["conversation-composer"] } } } } },
    Component: ({ renderSlot }) => <ConversationThread autoFocus={false} composer={renderSlot("composer", null)} />,
  };
  const sourcePlugin: UIPluginDefinition = {
    manifest: { id: "composer-slot-test-source", name: "Test sources", description: "Test business data", version: "1.0.0", capabilities: ["headless"] },
    provides: [CONVERSATION_MENTION_SOURCE, CONVERSATION_COMMAND_SOURCE],
    setup: ({ services }) => {
      services.provide(CONVERSATION_MENTION_SOURCE, { cacheKey: "roster", search });
      services.provide(CONVERSATION_COMMAND_SOURCE, commands);
    },
    Component: () => null,
  };
  // Directly imported localized components need locale permission in this
  // standalone test registry. Keep their real components and trigger services.
  const localized = (definition: UIPluginDefinition): UIPluginDefinition => ({
    ...definition, optionalInject: [...new Set([...(definition.optionalInject ?? []), "agent-ui.locale"])],
  });
  const registry = createPluginRegistry([hostPlugin, sourcePlugin, conversationComposerPlugin, conversationLexicalComposerInputPlugin,
    localized(conversationMentionTriggerPlugin), localized(conversationSlashCommandTriggerPlugin), localized(conversationQuotePlugin),
    conversationAddAttachmentActionPlugin, conversationDictationActionPlugin, conversationSubmitActionPlugin]);
  const catalog = createPluginCompositionCatalog(registry);
  let model: AppUIModel = parseAppUIModel({
    applicationPlugins: [{ id: "test-source", pluginId: sourcePlugin.manifest.id, enabled: true }],
    root: { type: "slot", plugins: [{ id: "test-host", pluginId: hostPlugin.manifest.id, enabled: true, slots: { composer: [composer] } }] },
  });
  const chatModel = { run: vi.fn(async () => ({ content: [{ type: "text" as const, text: "unused" }] })) };
  let runtime!: AssistantRuntime;
  function Host({ composition }: { composition: AppUIModel }) {
    const localRuntime = useLocalRuntime(chatModel);
    useEffect(() => { runtime = localRuntime; }, [localRuntime]);
    return <AssistantRuntimeProvider runtime={localRuntime}><AgentUIRoot theme="violet">
      <PluginRuntimeFixture model={compileAppUIModel(composition, catalog)} registry={registry}
        appUIModelHash={createHash("sha256").update(JSON.stringify(composition)).digest("hex")} actions={{ sendMessage: async () => {}, resumeInterrupts: async () => {}, startNewConversation: async () => {}, abortRun: () => {} }}
        conversation={{ id: "slot-lifecycle" }} messages={[]} state={null} run={{ status: "idle" }} executions={[]} interrupts={[]} />
    </AgentUIRoot></AssistantRuntimeProvider>;
  }
  const container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  const render = async () => { await act(async () => root!.render(<Host composition={model} />)); };
  const mutate = async (change: AppUIOperation) => { model = applyAppUIOperations(model, [change]); await render(); };
  const chip = () => container.querySelector('[data-directive-id="employee_84721"]');
  const textarea = () => container.querySelector<HTMLTextAreaElement>('[data-slot="aui_composer-shell"] textarea');
  const richInput = () => container.querySelector('.aui-lexical-input[contenteditable="true"]');
  const quote = () => container.querySelector('[data-slot="composer-quote"]');
  const choose = async (label: string) => {
    await until(() => [...container.querySelectorAll('[role="option"]')].some(option => option.textContent!.includes(label)));
    const option = [...container.querySelectorAll<HTMLElement>('[role="option"]')].find(option => option.textContent!.includes(label))!;
    await act(async () => option.click());
  };
  const type = async (text: string) => {
    await act(async () => runtime.thread.composer.setText(text));
    await act(async () => {
      const input = textarea()!;
      input.focus(); input.setSelectionRange(0, 0); document.dispatchEvent(new Event("selectionchange"));
      input.setSelectionRange(text.length, text.length); document.dispatchEvent(new Event("selectionchange"));
      input.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    });
  };

  await render(); await until(() => richInput() !== null);
  expect(textarea()).toBeNull();
  const composerRuntime = runtime.thread.composer;
  await act(async () => { composerRuntime.setText(draft); composerRuntime.setQuote({ text: "原引用", messageId: "quoted-message" }); });
  await until(() => chip() !== null && quote() !== null);
  expect(chip()!.textContent).toBe("@张三");

  await mutate(operation === "disable" ? { type: "set_plugin_enabled", instanceId: inputId, enabled: false } : { type: "remove_plugin", instanceId: inputId });
  await until(() => textarea() !== null && richInput() === null);
  expect(runtime.thread.composer).toBe(composerRuntime);
  expect(textarea()!.value).toBe(draft);
  expect(composerRuntime.getState().text).toBe(draft);
  expect(quote()!.textContent).toContain("原引用");
  const locations = collectAppUIPluginLocations(model);
  for (const id of ["mention-trigger-main", "slash-command-trigger-main", "conversation-quote-main"]) {
    expect(locations.find(entry => entry.plugin.id === id)?.plugin.enabled).toBe(true);
  }

  await type("@张"); await choose("张三");
  expect(search).toHaveBeenCalled();
  expect(textarea()!.value).toBe(":user[张三]{name=employee_84721} ");
  await type("/new"); await choose("新会话"); await until(() => execute.mock.calls.length === 1);
  expect(composerRuntime.getState().text).toBe("");
  expect(chatModel.run).not.toHaveBeenCalled();
  await type("/sum"); await choose("总结");
  expect(textarea()!.value).toBe(":command[总结]{name=summarize} ");
  expect(chatModel.run).not.toHaveBeenCalled();
  expect(quote()!.textContent).toContain("原引用");

  await type(draft);
  await mutate(operation === "disable" ? { type: "set_plugin_enabled", instanceId: inputId, enabled: true } : {
    type: "insert_plugin", plugin: originalInput, target: { type: "plugin_slot", parentInstanceId: composerId, slot: "input" },
  });
  await until(() => richInput() !== null && chip() !== null && textarea() === null);
  expect(runtime.thread.composer).toBe(composerRuntime);
  expect(composerRuntime.getState().text).toBe(draft);
  expect(chip()!.textContent).toBe("@张三");
  expect(quote()!.textContent).toContain("原引用");
});
