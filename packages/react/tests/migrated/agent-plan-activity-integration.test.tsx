// @vitest-environment jsdom

import { HttpAgent } from "@ag-ui/client";
import type { RunAgentInput } from "@ag-ui/core";
import { useAui, MessagePrimitive, ThreadPrimitive, type AssistantRuntime } from "@assistant-ui/react";
import { ConversationRuntimeProvider, type ConversationThreadBinding } from "@agent-ui/runtime-conversation";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DataMessageUIRegistration } from "@agent-ui/react";
import { agentPlanActivityMessageUI } from "../../../source-registry/registry/items/plugin-agent-plan-message/files/plugins/agent-plan-message/index";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const disposers: (() => Promise<void>)[] = [];
const tick = () => new Promise<void>(resolve => setTimeout(resolve, 0));

async function until(predicate: () => boolean) {
  for (let index = 0; index < 100; index++) {
    if (predicate()) return;
    await tick();
  }
  throw new Error("Timed out waiting for AgentPlan activity integration");
}

function Message() {
  return <MessagePrimitive.Root><MessagePrimitive.Parts /></MessagePrimitive.Root>;
}

function Capture({ onRuntime }: { onRuntime: (runtime: AssistantRuntime) => void }) {
  onRuntime(useAui().threads.__internal_getAssistantRuntime!());
  return null;
}

async function fixture() {
  const binding: ConversationThreadBinding = {
    getThreadId: () => "agent-plan-thread",
    activateThread: () => undefined,
    subscribe: () => () => undefined,
    createNewThread: async () => "agent-plan-new-thread",
    loadThread: async () => ({ messages: [] }),
    getThreadListSnapshot: () => ({ threads: [], archivedThreads: [] }),
  };
  const inputs: RunAgentInput[] = [];
  const streams: { emit(event: Record<string, unknown>): void; close(): void }[] = [];
  let runtime!: AssistantRuntime;
  const container = document.createElement("div");
  document.body.append(container);
  const root: Root = createRoot(container);

  await act(async () => {
    root.render(
      <ConversationRuntimeProvider
        endpoint="http://example.test/agent-plan"
        threadBinding={binding}
        unstable_agentFactory={({ threadId }) => new HttpAgent({
          threadId,
          url: "http://example.test/agent-plan",
          fetch: async (_url, init) => {
            const input = JSON.parse(String(init.body)) as RunAgentInput;
            inputs.push(input);
            const encoder = new TextEncoder();
            let controller!: ReadableStreamDefaultController<Uint8Array>;
            const body = new ReadableStream<Uint8Array>({
              start(next) { controller = next; },
            });
            let closed = false;
            const stream = {
              emit(event: Record<string, unknown>) {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
              },
              close() {
                if (closed) return;
                closed = true;
                controller.close();
              },
            };
            streams.push(stream);
            stream.emit({ type: "RUN_STARTED", threadId: input.threadId, runId: input.runId });
            return new Response(body, { headers: { "Content-Type": "text/event-stream" } });
          },
        })}
      >
        <DataMessageUIRegistration definition={agentPlanActivityMessageUI} />
        <Capture onRuntime={value => { runtime = value; }} />
        <ThreadPrimitive.Messages components={{ Message }} />
      </ConversationRuntimeProvider>,
    );
    await tick();
  });

  disposers.push(async () => {
    await act(async () => {
      streams.forEach(stream => stream.close());
      await tick();
      root.unmount();
    });
    container.remove();
  });

  return {
    inputs,
    streams,
    runtime,
    container,
    async start() {
      await act(async () => {
        runtime.thread.append({
          role: "user",
          content: [{ type: "text", text: "Update the workspace" }],
          startRun: true,
        });
        await until(() => streams.length === 1);
      });
    },
    async send(event: Record<string, unknown>) {
      await act(async () => {
        streams[0]!.emit(event);
        await tick();
      });
    },
    async finish() {
      const input = inputs[0]!;
      await act(async () => {
        streams[0]!.emit({ type: "RUN_FINISHED", threadId: input.threadId, runId: input.runId });
        streams[0]!.close();
        await tick();
      });
    },
  };
}

afterEach(async () => {
  for (const dispose of disposers.splice(0)) await dispose();
  vi.restoreAllMocks();
});

describe("authoritative AgentPlan Activity through react-ag-ui", () => {
  it("updates one Data Message in place from ACTIVITY_SNAPSHOT and ACTIVITY_DELTA", async () => {
    const f = await fixture();
    await f.start();
    await f.send({
      type: "ACTIVITY_SNAPSHOT",
      messageId: "agent-plan-1",
      activityType: "agent-plan",
      replace: true,
      content: {
        title: "Workspace update",
        steps: [
          { id: "inspect", label: "Inspect", description: "Read the active source." },
          { id: "compare", label: "Compare", description: "Compare contract boundaries." },
          { id: "update", label: "Update", description: "Change the message rendering." },
          { id: "verify", label: "Verify", description: "Check the focused regressions." },
        ],
        activeIndex: 0,
      },
    });
    await act(async () => { await until(() => f.container.querySelector('[data-slot="agent-plan"]') !== null); });
    expect(f.container.querySelectorAll('[data-slot="agent-plan"]')).toHaveLength(1);
    expect(f.container.textContent).toContain("Workspace update");
    expect(f.container.textContent).toContain("Inspect");
    expect(f.container.textContent).toContain("Inspect in progress");
    expect(f.container.textContent).toContain("Read the active source.");
    expect(f.container.textContent).toContain("Compare not started");
    expect(f.container.textContent).toContain("0 of 4");

    await f.send({
      type: "ACTIVITY_DELTA",
      messageId: "agent-plan-1",
      activityType: "agent-plan",
      patch: [{ op: "replace", path: "/activeIndex", value: 1 }],
    });
    expect(f.container.querySelectorAll('[data-slot="agent-plan"]')).toHaveLength(1);
    expect(f.container.textContent).toContain("1 of 4");
    expect(f.container.textContent).toContain("Compare in progress");
    expect(f.container.textContent).toContain("Compare contract boundaries.");

    await f.send({
      type: "ACTIVITY_DELTA",
      messageId: "agent-plan-1",
      activityType: "agent-plan",
      patch: [{ op: "replace", path: "/activeIndex", value: 4 }],
    });
    expect(f.container.querySelectorAll('[data-slot="agent-plan"]')).toHaveLength(1);
    expect(f.container.textContent).toContain("4 of 4");
    expect(f.inputs).toHaveLength(1);
    expect(f.inputs[0]!.tools.some(tool => tool.name === "mock_agent_plan")).toBe(false);
    await f.finish();
  });

  it("renders no Plan and keeps the thread alive for an invalid activity payload", async () => {
    const f = await fixture();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await f.start();
    await f.send({
      type: "ACTIVITY_SNAPSHOT",
      messageId: "agent-plan-invalid",
      activityType: "agent-plan",
      replace: true,
      content: { steps: "invalid" },
    });
    expect(f.container.querySelector('[data-slot="agent-plan"]')).toBeNull();
    expect(JSON.stringify(f.runtime.thread.getState().messages))
      .toContain('"name":"agui-activity/agent-plan"');
    expect(consoleError).not.toHaveBeenCalled();
    await f.finish();
  });
});
