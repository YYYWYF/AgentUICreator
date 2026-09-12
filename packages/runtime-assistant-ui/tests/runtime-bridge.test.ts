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
  createAssistantUiAgentRuntimeBridge,
} from "../src/compatibility/agent-runtime-bridge.js";
import type { AssistantUiApplicationEventSource } from "../src/events/application-event-source.js";
import { createEphemeralAssistantUiThreadBinding } from "../src/threads/ephemeral-thread-binding.js";

function createFixture() {
  const listeners = new Set<() => void>();
  let isRunning = false;
  let messages: unknown[] = [];
  let interrupts: AgUiInterrupt[] = [];
  const append = vi.fn(() => {
    isRunning = true;
    for (const listener of listeners) listener();
  });
  const cancelRun = vi.fn(() => {
    isRunning = false;
    for (const listener of listeners) listener();
  });
  const binding = createEphemeralAssistantUiThreadBinding();
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
        state: { count: 1 },
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
  } as unknown as AssistantUiApplicationEventSource;
  const bridge = createAssistantUiAgentRuntimeBridge({
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
    submit,
    switchToNewThread,
  };
}

describe("AssistantUiAgentRuntimeBridge", () => {
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
});
