// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { AssistantRuntimeProvider, useAui, useLocalRuntime, type AssistantRuntime } from "@assistant-ui/react";
import { ConversationRuntimeProvider, type ConversationThreadBinding, type ConversationLoadedThread } from "@za38.03/agent-ui-runtime";
import { afterEach, expect, it, vi } from "vitest";
import { AgentUIRoot, AgentUILocaleProvider } from "../dist/index.js";
import { ConversationComposerPlugin as NpmComposer } from "../dist/composer/index.js";
import { ConversationComposerPlugin as SourceComposer } from "../dist/sources/takeover/composer/index";

let root: Root | undefined;
afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

it.each([{ name: "npm", Composer: NpmComposer }, { name: "portable", Composer: SourceComposer }])(
  "$name Composer retains its basic input through an empty runtime Slot wrapper", async ({ Composer }) => {
    vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
    let runtime!: AssistantRuntime;
    function Host() {
      runtime = useLocalRuntime({ async *run() { yield { content: [{ type: "text" as const, text: "done" }] }; } });
      return <AssistantRuntimeProvider runtime={runtime}><AgentUIRoot theme="light"><AgentUILocaleProvider locale="en-US">
        <Composer renderSlot={(_name: string, fallback?: ReactNode) => <div>{fallback}</div>}
          renderScopedSlot={(_name, _scope, fallback) => fallback}
          rows={3} maxLength={120} submitMode="ctrlEnter"
          inputProps={{ "aria-label": "Basic input", rows: 1, maxLength: 10, placeholder: "Project placeholder" }} />
      </AgentUILocaleProvider></AgentUIRoot></AssistantRuntimeProvider>;
    }
    const host = document.createElement("div"); document.body.append(host); root = createRoot(host);
    await act(async () => root!.render(<Host />));
    const input = host.querySelector<HTMLTextAreaElement>('textarea[aria-label="Basic input"]')!;
    expect(input).toBeTruthy();
    expect(input.rows).toBe(3);
    expect(input.maxLength).toBe(120);
    expect(input.placeholder).toBe("Project placeholder");
    expect(host.querySelector('[contenteditable="true"]')).toBeNull();
    await act(async () => runtime.thread.composer.setText("Basic draft"));
    expect(input.value).toBe("Basic draft");
    await act(async () => input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true })));
    expect(runtime.thread.composer.getState().text).toBe("Basic draft");
  },
);

it.each([{ name: "npm", Composer: NpmComposer }, { name: "portable", Composer: SourceComposer }])(
  "$name Composer waits for thread history before accepting a draft", async ({ Composer }) => {
    vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
    let loaded!: (value: ConversationLoadedThread) => void;
    const history = new Promise<ConversationLoadedThread>(resolve => { loaded = resolve; });
    const binding: ConversationThreadBinding = {
      getThreadId: () => "loading-thread", subscribe: () => () => {},
      createNewThread: async () => "new-thread", loadThread: () => history,
    };
    let runtime!: AssistantRuntime;
    function Capture() { runtime = useAui().threads.__internal_getAssistantRuntime!(); return null; }
    const host = document.createElement("div"); document.body.append(host); root = createRoot(host);
    await act(async () => root!.render(<ConversationRuntimeProvider endpoint="http://example.test/unused" threadBinding={binding}>
      <AgentUILocaleProvider locale="en-US"><Capture /><Composer renderSlot={(_name, fallback) => fallback} renderScopedSlot={(_name, _scope, fallback) => fallback} /></AgentUILocaleProvider>
    </ConversationRuntimeProvider>));
    const input = host.querySelector<HTMLTextAreaElement>("textarea")!;
    expect(input.disabled).toBe(true);
    await act(async () => loaded({ messages: [] }));
    await vi.waitFor(() => expect(input.disabled).toBe(false));
    await act(async () => runtime.thread.composer.setText("Ready draft"));
    expect(input.value).toBe("Ready draft");
  },
);
