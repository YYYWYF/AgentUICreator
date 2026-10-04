// @vitest-environment jsdom

import {
  MessagePrimitive,
  ThreadPrimitive,
  useAui,
  type AssistantRuntime,
} from "@assistant-ui/react";
import { act, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { ConversationRuntimeProvider } from "@agent-ui/runtime-conversation";
import { DataMessageUIRegistration } from "@agent-ui/react";
import { agentPlanActivityMessageUI } from "../../../source-registry/registry/items/plugin-agent-plan-message/files/plugins/agent-plan-message/index";
import {
  useConversationServiceThreadBinding,
  type ConversationRunResumeProvider,
  type ConversationServiceThreadBinding,
} from "../../../source-registry/registry/items/foundation-core-adapters/files/agent-ui/conversation/threads/conversation-service-thread-binding";
import type {
  ConversationDetail, ConversationService, ConversationSnapshot,
} from "../../../source-registry/registry/items/foundation-core-application/files/services/conversations";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const detail: ConversationDetail = {
  id: "running-thread", title: "Running",
  history: { format: "langchain", messages: [
    { id: "persisted-user", type: "human", content: "long task" },
    { id: "persisted-assistant", type: "ai", content: "partial" },
  ] },
};

function service(): ConversationService & { loadConversation: ReturnType<typeof vi.fn> } {
  const snapshot: ConversationSnapshot = {
    mode: "history", conversations: [{ id: detail.id, title: detail.title }],
    listStatus: "ready", detailStatus: "ready", activeConversationId: detail.id,
  };
  return {
    getSnapshot: () => snapshot, subscribe: () => () => {},
    refresh: async () => {}, deleteConversation: async () => {},
    selectConversation: async () => detail,
    loadConversation: vi.fn(async () => detail),
    showConversation: () => {}, showLiveConversation: () => {}, resetForNewConversation: () => {},
  };
}

function Capture({ onRuntime }: { onRuntime: (runtime: AssistantRuntime) => void }) {
  onRuntime(useAui().threads.__internal_getAssistantRuntime!());
  return null;
}

function Message() {
  return <MessagePrimitive.Root><MessagePrimitive.Parts /></MessagePrimitive.Root>;
}

function Fixture({ provider, conversation, onBinding, onRuntime, onError, runAgent }: {
  provider: ConversationRunResumeProvider;
  conversation: ConversationService;
  onBinding: (binding: ConversationServiceThreadBinding) => void;
  onRuntime: (runtime: AssistantRuntime) => void;
  onError?: ((error: Error) => void) | undefined;
  runAgent: ReturnType<typeof vi.fn>;
}) {
  const binding = useConversationServiceThreadBinding(provider, "running-thread");
  onBinding(binding);
  useEffect(() => binding.attachConversationService(conversation), [binding, conversation]);
  return <ConversationRuntimeProvider endpoint="http://example.test/agent" threadBinding={binding}
    onError={onError}
    unstable_agentFactory={({ threadId }) => ({ threadId, runAgent, abortRun: vi.fn(),
      subscribe: () => ({ unsubscribe: () => {} }) }) as never}>
    <Capture onRuntime={onRuntime} />
    <DataMessageUIRegistration definition={agentPlanActivityMessageUI} />
    <ThreadPrimitive.Messages components={{ Message }} />
  </ConversationRuntimeProvider>;
}

describe("generated Agent thread identity and resume provider lifecycle", () => {
  it("keeps persisted history and state when resume discovery rejects", async () => {
    const conversation = service();
    conversation.loadConversation.mockResolvedValue({ ...detail, agentState: { progress: 1 } });
    const failure = new Error("resume discovery failed");
    const provider = vi.fn(async () => { throw failure; });
    const runAgent = vi.fn();
    const errors: Error[] = [];
    let runtime!: AssistantRuntime;
    let binding!: ConversationServiceThreadBinding;
    const root = createRoot(document.createElement("div"));
    try {
      await act(async () => { root.render(<Fixture provider={provider} conversation={conversation}
        onBinding={value => { binding = value; }} onRuntime={value => { runtime = value; }}
        onError={error => errors.push(error)} runAgent={runAgent} />); });
      await vi.waitFor(() => expect(errors).toContain(failure));
      const messages = runtime.thread.getState().messages;
      expect(conversation.loadConversation).toHaveBeenCalledWith("running-thread");
      expect(messages.filter(message => message.role === "user")).toHaveLength(1);
      expect(messages.filter(message => message.role === "assistant")).toHaveLength(1);
      expect(messages.find(message => message.role === "assistant")?.content)
        .toEqual(expect.arrayContaining([expect.objectContaining({ type: "text", text: "partial" })]));
      expect(runtime.thread.getState().state).toEqual({ progress: 1 });
      expect(runtime.thread.getState().isDisabled).toBe(false);
      expect(binding.getThreadId()).toBe("running-thread");
      expect(provider).toHaveBeenCalledOnce();
      expect(runAgent).not.toHaveBeenCalled();
    } finally { await act(async () => { root.unmount(); }); }
  });

  it("loads the initial persisted thread and consumes its run without a new Agent invocation", async () => {
    const conversation = service();
    const runAgent = vi.fn();
    const stream = vi.fn(async function* () {
      yield { content: [{ type: "text", text: " continuation" }],
        status: { type: "complete" as const, reason: "stop" as const } };
    });
    const provider = vi.fn(() => ({ stream }));
    let binding!: ConversationServiceThreadBinding;
    let runtime!: AssistantRuntime;
    const element = document.createElement("div");
    const root = createRoot(element);
    try {
      await act(async () => { root.render(<Fixture provider={provider} conversation={conversation}
        onBinding={value => { binding = value; }} onRuntime={value => { runtime = value; }} runAgent={runAgent} />); });
      await vi.waitFor(() => {
        expect(conversation.loadConversation).toHaveBeenCalledWith("running-thread");
        expect(stream).toHaveBeenCalledOnce();
        expect(runtime.thread.getState().messages.some(message => message.role === "assistant" &&
          message.content.some(part => part.type === "text" && part.text.includes("continuation")))).toBe(true);
      });
      expect(binding.getThreadId()).toBe("running-thread");
      expect(provider).toHaveBeenCalledWith(expect.objectContaining({ threadId: "running-thread" }));
      expect(runAgent).not.toHaveBeenCalled();
    } finally { await act(async () => { root.unmount(); }); }
  });

  it("keeps the mounted binding and thread while switching to the latest provider", async () => {
    const conversation = service();
    const runAgent = vi.fn();
    const first = vi.fn(() => undefined);
    const latestResume = { async *stream() { yield { status: { type: "complete" as const, reason: "stop" as const } }; } };
    const latest = vi.fn(() => latestResume);
    let binding!: ConversationServiceThreadBinding;
    let runtime!: AssistantRuntime;
    const element = document.createElement("div");
    const root = createRoot(element);
    const render = (provider: ConversationRunResumeProvider) => <Fixture provider={provider} conversation={conversation}
      onBinding={value => { binding = value; }} onRuntime={value => { runtime = value; }} runAgent={runAgent} />;
    try {
      await act(async () => { root.render(render(first)); });
      await vi.waitFor(() => expect(conversation.loadConversation).toHaveBeenCalledTimes(1));
      const originalBinding = binding;
      const originalThread = runtime.thread;
      await act(async () => { root.render(render(latest)); });
      expect(binding).toBe(originalBinding);
      expect(binding.getThreadId()).toBe("running-thread");
      expect(runtime.thread).toBe(originalThread);
      expect(conversation.loadConversation).toHaveBeenCalledTimes(1);
      expect((await binding.loadThread!("running-thread")).resume).toBe(latestResume);
      expect(latest).toHaveBeenCalledOnce();
      expect(runAgent).not.toHaveBeenCalled();
    } finally { await act(async () => { root.unmount(); }); }
  });

  it("restores the latest live plan on resume without another Agent invocation", async () => {
    const conversation = service();
    const runAgent = vi.fn();
    const plan = {
      title: "Workspace update",
      steps: [
        { id: "inspect", label: "Inspect", description: "Read the active source." },
        { id: "update", label: "Update", description: "Change the current UI." },
        { id: "verify", label: "Verify", description: "Check the focused regressions." },
      ],
      activeIndex: 1,
    };
    const resume = {
      stream: vi.fn(async function* () {
        yield {
          content: [{ type: "data", name: "agui-activity/agent-plan", data: plan }],
          status: { type: "complete" as const, reason: "stop" as const },
        };
      }),
    };
    const provider = vi.fn(() => resume);
    let runtime!: AssistantRuntime;
    let binding!: ConversationServiceThreadBinding;
    const element = document.createElement("div");
    const root = createRoot(element);
    try {
      await act(async () => { root.render(<Fixture provider={provider} conversation={conversation}
        onBinding={value => { binding = value; }} onRuntime={value => { runtime = value; }} runAgent={runAgent} />); });
      await act(async () => {
        await vi.waitFor(() => {
          expect(element.querySelectorAll('[data-slot="agent-plan"]')).toHaveLength(1);
          expect(element.textContent).toContain("1 of 3");
        });
      });
      expect(element.textContent).toContain("Workspace update");
      expect(element.textContent).toContain("Change the current UI.");
      expect(element.textContent).toContain("Verify not started");
      expect(binding.getThreadId()).toBe("running-thread");
      expect(provider).toHaveBeenCalledOnce();
      expect(resume.stream).toHaveBeenCalledOnce();
      expect(runAgent).not.toHaveBeenCalled();
      expect(JSON.stringify(runtime.thread.getState().messages))
        .toContain('"name":"agui-activity/agent-plan"');
    } finally { await act(async () => { root.unmount(); }); }
  });
});
