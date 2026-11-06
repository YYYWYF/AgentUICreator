import type { AgentApplicationEventListener } from "@za38.03/agent-ui-core";
import type {
  AgUiAssistantRuntime,
  AgUiInterrupt,
  AgUiResumeEntry,
} from "@assistant-ui/react-ag-ui";
import { describe, expect, it, vi } from "vitest";

import {
  AgentUiRuntimeBusyError,
  UnsupportedAgentInputError,
  UnsupportedInterruptResponseMetadataError,
  createConversationAgentRuntimeBridge,
} from "../src/compatibility/conversation-runtime-bridge.js";
import type { ConversationApplicationEventSource } from "../src/events/conversation-application-event-source.js";
import { createEphemeralConversationThreadBinding } from "../src/threads/ephemeral-thread-binding.js";

function createFixture() {
  const listeners = new Set<() => void>();
  const applicationListeners = new Set<AgentApplicationEventListener>();
  let isRunning = false;
  let messages: unknown[] = [];
  let state: unknown = { count: 1 };
  let interrupts: AgUiInterrupt[] = [];
  const append = vi.fn(() => {
    isRunning = true;
    for (const listener of listeners) listener();
  });
  const cancelRun = vi.fn(() => {
    isRunning = false;
    for (const listener of listeners) listener();
  });
  const binding = createEphemeralConversationThreadBinding();
  const switchToNewThread = vi.fn(async () => {
    await binding.createNewThread();
    messages = [];
    for (const listener of listeners) listener();
  });
  const submit = vi.fn(async (_responses: readonly AgUiResumeEntry[]) => {
    interrupts = [];
  });
  const runtime = {
    thread: {
      append,
      cancelRun,
      subscribe(listener: () => void) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      getState: () => ({
        isRunning,
        messages,
        state,
      }),
    },
    threads: {
      subscribe(listener: () => void) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      switchToNewThread,
    },
    unstable_getPendingInterrupts: () => interrupts,
    unstable_submitInterruptResponses: submit,
  } as unknown as AgUiAssistantRuntime;
  const applicationEvents = {
    subscribe: (listener: AgentApplicationEventListener) => {
      applicationListeners.add(listener);
      return () => applicationListeners.delete(listener);
    },
  } as unknown as ConversationApplicationEventSource;
  const bridge = createConversationAgentRuntimeBridge({
    runtime,
    threadBinding: binding,
    applicationEvents,
  });
  bridge.start();
  return {
    append,
    bridge,
    cancelRun,
    finishRun() {
      isRunning = false;
      for (const listener of listeners) listener();
    },
    setRunning(nextIsRunning: boolean) {
      isRunning = nextIsRunning;
    },
    setInterrupts(next: AgUiInterrupt[]) {
      interrupts = next;
      for (const listener of listeners) listener();
    },
    setMessages(next: unknown[]) {
      messages = next;
      for (const listener of listeners) listener();
    },
    emitInterrupt(payload: unknown) {
      for (const listener of applicationListeners) listener({ name: "on_interrupt", payload, producer: { type: "root" } });
    },
    setState(nextState: unknown) {
      state = nextState;
      for (const listener of listeners) listener();
    },
    submit,
    switchToNewThread,
  };
}

describe("ConversationAgentRuntimeBridge", () => {
  it("settles send on the Runtime busy-to-idle edge and rejects overlap", async () => {
    const fixture = createFixture();
    let settled = false;
    const send = fixture.bridge.sendMessage("A").then(() => { settled = true; });
    expect(fixture.append).toHaveBeenCalledTimes(1);
    await expect(fixture.bridge.sendMessage("B")).rejects.toBeInstanceOf(
      AgentUiRuntimeBusyError,
    );
    expect(settled).toBe(false);
    fixture.finishRun();
    await send;
    expect(settled).toBe(true);
  });

  it("delegates abort and new-conversation identity to public Runtime actions", async () => {
    const fixture = createFixture();
    const send = fixture.bridge.sendMessage("A");
    fixture.bridge.abort();
    await send;
    expect(fixture.cancelRun).toHaveBeenCalledTimes(1);
    const oldId = fixture.bridge.getSnapshot().conversation.id;
    await fixture.bridge.startNewConversation();
    expect(fixture.switchToNewThread).toHaveBeenCalledTimes(1);
    expect(fixture.bridge.getSnapshot().conversation.id).not.toBe(oldId);
    expect(fixture.bridge.getSnapshot().messages).toEqual([]);
  });

  it("settles pending sends and clears projected errors on cancellation", async () => {
    const fixture = createFixture();
    const send = fixture.bridge.sendMessage("A");

    fixture.setRunning(false);
    fixture.bridge.recordCancellation();

    await expect(send).resolves.toBeUndefined();
    expect(fixture.bridge.getSnapshot().run).toEqual({ status: "idle" });

    fixture.bridge.recordError(new Error("server failed"));
    expect(fixture.bridge.getSnapshot().run).toEqual({
      status: "error",
      error: { message: "server failed" },
    });

    fixture.bridge.recordCancellation();
    expect(fixture.bridge.getSnapshot().run).toEqual({ status: "idle" });
  });

  it("projects the assistant-ui thread state without a second state owner", () => {
    const fixture = createFixture();

    fixture.setState({
      trip: {
        destination: "Tokyo",
        days: 5,
        status: "ready",
        budget: 1200,
      },
    });

    expect(fixture.bridge.getSnapshot().state).toEqual({
      trip: {
        destination: "Tokyo",
        days: 5,
        status: "ready",
        budget: 1200,
      },
    });
  });

  it("rejects unsupported media without silently dropping it", async () => {
    const { bridge } = createFixture();
    await expect(bridge.sendMessage({
      content: [{
        type: "image",
        source: { type: "url", value: "https://example.invalid/image.png" },
      }],
    })).rejects.toBeInstanceOf(UnsupportedAgentInputError);
  });

  it("validates a complete interrupt response set before the public wrapper", async () => {
    const fixture = createFixture();
    fixture.setInterrupts([
      { id: "approval", reason: "confirmation", message: "Continue?" },
    ]);
    expect(fixture.bridge.getSnapshot().run.status).toBe("awaiting-input");
    await expect(fixture.bridge.resumeInterrupts([])).rejects.toThrow(
      "Missing response",
    );
    expect(fixture.submit).not.toHaveBeenCalled();
    await fixture.bridge.resumeInterrupts([
      { interruptId: "approval", status: "resolved", payload: true },
    ]);
    expect(fixture.submit).toHaveBeenCalledWith([
      { interruptId: "approval", status: "resolved", payload: true },
    ]);
  });

  it("rejects interrupt response metadata instead of silently dropping it", async () => {
    const fixture = createFixture();
    fixture.setInterrupts([
      { id: "approval", reason: "confirmation", message: "Continue?" },
    ]);

    const resume = fixture.bridge.resumeInterrupts([
      {
        interruptId: "approval",
        status: "resolved",
        payload: true,
        metadata: { source: "approval-dialog" },
      },
    ]);

    await expect(resume).rejects.toBeInstanceOf(
      UnsupportedInterruptResponseMetadataError,
    );
    await expect(resume).rejects.toMatchObject({
      code: "AGENT_UI_UNSUPPORTED_INTERRUPT_RESPONSE_METADATA",
    });
    expect(fixture.submit).not.toHaveBeenCalled();
  });
});

function reviewPayload(indices: number[]) {
  return {
    action_requests: indices.map(index => ({ name: "confirm", args: { index } })),
    review_configs: [{ action_name: "confirm", allowed_decisions: ["approve", "reject", "edit", "respond"] }],
  };
}

function reviewInterrupt(id: string, indices: number[]): AgUiInterrupt {
  return { id, reason: "langgraph:interrupt", metadata: { langgraph: { raw: reviewPayload(indices) } } };
}

function toolMessages(indices: number[]) {
  return [{ id: "assistant-1", role: "assistant", status: { type: "requires-action", reason: "interrupt" },
    content: indices.map((index, ordinal) => ({ type: "tool-call", toolCallId: `tool-${ordinal}`, toolName: "confirm",
      args: { index }, argsText: JSON.stringify({ index }) })),
  }];
}

describe("LangGraph review interrupt decisions", () => {
  it.each(["one-interrupt", "multiple-interrupts"])("resumes only after every decision in $0 is present", async batch => {
    const fixture = createFixture();
    fixture.setMessages(toolMessages([0, 1]));
    fixture.setInterrupts(batch === "one-interrupt"
      ? [reviewInterrupt("review-1", [0, 1])]
      : [reviewInterrupt("review-1", [0]), reviewInterrupt("review-2", [1])]);
    await fixture.bridge.submitCommandDecision("tool-1", "reject");
    expect(fixture.submit).not.toHaveBeenCalled();
    expect(fixture.bridge.getCommandDecisionRequest("tool-0")).toBeDefined();
    expect(fixture.bridge.getCommandDecisionRequest("tool-1")).toBeUndefined();
    await fixture.bridge.submitCommandDecision("tool-0", "approve");
    expect(fixture.submit).toHaveBeenCalledTimes(1);
    expect(fixture.submit).toHaveBeenCalledWith(batch === "one-interrupt" ? [{
      interruptId: "review-1", status: "resolved", payload: { decisions: [{ type: "approve" }, { type: "reject" }] },
    }] : [
      { interruptId: "review-1", status: "resolved", payload: { decisions: [{ type: "approve" }] } },
      { interruptId: "review-2", status: "resolved", payload: { decisions: [{ type: "reject" }] } },
    ]);
    expect(fixture.bridge.getSnapshot().run.status).toBe("idle");
  });

  it.each([{ indices: [0, 0] }, { indices: [1] }])("does not approve ambiguous or mismatched tool arguments: $indices", async ({ indices }) => {
    const fixture = createFixture();
    fixture.setMessages(toolMessages(indices));
    fixture.emitInterrupt(JSON.stringify(reviewPayload([0])));
    fixture.setInterrupts([reviewInterrupt("review-1", [0])]);
    for (const index of indices.keys()) expect(fixture.bridge.getCommandDecisionRequest(`tool-${index}`)).toBeUndefined();
    expect(fixture.bridge.getSnapshot().run.status).toBe("awaiting-input");
    expect(fixture.submit).not.toHaveBeenCalled();
  });

  it("keeps the approval available after a rejected resume submission", async () => {
    const fixture = createFixture();
    fixture.setMessages(toolMessages([0]));
    fixture.setInterrupts([reviewInterrupt("review-1", [0])]);
    fixture.submit.mockRejectedValueOnce(new Error("Resume rejected"));
    await expect(fixture.bridge.submitCommandDecision("tool-0", "approve")).rejects.toThrow("Resume rejected");
    expect(fixture.bridge.getCommandDecisionRequest("tool-0")).toBeDefined();
    await fixture.bridge.submitCommandDecision("tool-0", "reject");
    expect(fixture.submit).toHaveBeenLastCalledWith([{ interruptId: "review-1", status: "resolved", payload: {
      decisions: [{ type: "reject" }],
    } }]);
    expect(fixture.bridge.getSnapshot().run.status).toBe("idle");
  });

  it("does not reuse a prior decision after the same interrupt's actions change", async () => {
    const fixture = createFixture();
    fixture.setMessages(toolMessages([0, 1]));
    fixture.setInterrupts([reviewInterrupt("review-1", [0, 1])]);
    await fixture.bridge.submitCommandDecision("tool-0", "approve");
    fixture.setMessages(toolMessages([2, 1]));
    fixture.setInterrupts([reviewInterrupt("review-1", [2, 1])]);
    expect(fixture.bridge.getCommandDecisionRequest("tool-0")).toBeDefined();
    await fixture.bridge.submitCommandDecision("tool-1", "reject");
    expect(fixture.submit).not.toHaveBeenCalled();
    await fixture.bridge.submitCommandDecision("tool-0", "reject");
    expect(fixture.submit).toHaveBeenCalledWith([{ interruptId: "review-1", status: "resolved", payload: {
      decisions: [{ type: "reject" }, { type: "reject" }],
    } }]);
  });

  it("respects the native toolCallId instead of binding a different matching tool", () => {
    const fixture = createFixture();
    fixture.setMessages(toolMessages([0, 1]));
    fixture.setInterrupts([{ ...reviewInterrupt("review-1", [0]), toolCallId: "tool-1" }]);
    expect(fixture.bridge.getCommandDecisionRequest("tool-0")).toBeUndefined();
    expect(fixture.bridge.getCommandDecisionRequest("tool-1")).toBeUndefined();
    expect(fixture.submit).not.toHaveBeenCalled();
  });

  it("does not omit unsupported actions from a native resume", () => {
    const fixture = createFixture();
    fixture.setMessages(toolMessages([0, 1]));
    const interrupt = reviewInterrupt("review-1", [0, 1]);
    interrupt.metadata = { langgraph: { raw: {
      action_requests: [{ name: "confirm", args: { index: 0 } }, { name: "edit_only", args: { index: 1 } }],
      review_configs: [
        { action_name: "confirm", allowed_decisions: ["approve", "reject"] },
        { action_name: "edit_only", allowed_decisions: ["edit", "respond"] },
      ],
    } } };
    fixture.setInterrupts([interrupt]);
    expect(fixture.bridge.getCommandDecisionRequest("tool-0")).toBeUndefined();
    expect(fixture.submit).not.toHaveBeenCalled();
  });
});
