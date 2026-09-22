import type { AgentApplicationEventListener } from "@agent-ui/runtime-core";
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
    subscribe: (_listener: AgentApplicationEventListener) => () => undefined,
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
    setInterrupts(next: AgUiInterrupt[]) {
      interrupts = next;
      for (const listener of listeners) listener();
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
