import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  AgentRuntime,
  AgentRuntimeSnapshot,
} from "@agent-ui/runtime-core";

import type {
  UIPluginActions,
  UIPluginEvents,
} from "../framework/contracts/ui-plugin";
import {
  AgentRuntimeProvider,
  PluginInstanceProvider,
  useAgentExecutions,
  useAgentInterrupts,
  useAgentMessages,
  useAgentRun,
  useAgentRuntimeActions,
  useAgentRuntimeSnapshot,
  usePluginActions,
  usePluginEvents,
  usePluginInstance,
  type AgentRuntimeActions,
} from "../runtime/context";

function snapshot(
  overrides: Partial<AgentRuntimeSnapshot<{ value: number }>> = {},
): AgentRuntimeSnapshot<{ value: number }> {
  return {
    conversation: { id: "conversation-a" },
    messages: [],
    state: { value: 1 },
    run: { status: "idle" },
    executions: [],
    interrupts: [],
    ...overrides,
  };
}

class TestAgentRuntime implements AgentRuntime<{ value: number }> {
  readonly mode = "test";
  readonly sendMessage = vi.fn(async () => undefined);
  readonly resumeInterrupts = vi.fn(async () => undefined);
  readonly startNewConversation = vi.fn(async () => undefined);
  readonly abort = vi.fn();
  readonly dispose = vi.fn();
  readonly listeners = new Set<() => void>();
  subscriptions = 0;
  unsubscriptions = 0;

  constructor(private current: AgentRuntimeSnapshot<{ value: number }>) {}

  readonly getSnapshot = () => this.current;

  readonly subscribe = (listener: () => void) => {
    this.subscriptions += 1;
    this.listeners.add(listener);
    return () => {
      this.unsubscriptions += 1;
      this.listeners.delete(listener);
    };
  };

  subscribeApplicationEvents() {
    return () => undefined;
  }

  publish(next: AgentRuntimeSnapshot<{ value: number }>): void {
    this.current = next;
    this.listeners.forEach((listener) => listener());
  }
}

describe("Agent Runtime Context", () => {
  beforeEach(() => {
    (
      globalThis as typeof globalThis & {
        IS_REACT_ACT_ENVIRONMENT: boolean;
      }
    ).IS_REACT_ACT_ENVIRONMENT = true;
  });

  it("reads the complete snapshot and fails fast outside its provider", () => {
    const runtime = new TestAgentRuntime(snapshot());
    let captured: AgentRuntimeSnapshot<{ value: number }> | undefined;
    const Probe = () => {
      captured = useAgentRuntimeSnapshot<{ value: number }>();
      return null;
    };

    renderToStaticMarkup(
      <AgentRuntimeProvider runtime={runtime}>
        <Probe />
      </AgentRuntimeProvider>,
    );

    expect(captured).toBe(runtime.getSnapshot());
    expect(() => renderToStaticMarkup(<Probe />)).toThrow(
      "AgentRuntimeProvider is missing",
    );
    expect(() => renderToStaticMarkup(<InstanceProbe />)).toThrow(
      "PluginInstanceProvider is missing",
    );
  });

  it("updates domain slices without rerendering an unchanged messages consumer", async () => {
    const initialMessages = [{
      id: "message-a",
      producer: { type: "root" as const },
      role: "assistant" as const,
      content: "A",
    }];
    const runtime = new TestAgentRuntime(snapshot({ messages: initialMessages }));
    let messagesRenderCount = 0;
    let runStatus = "";
    const MessagesProbe = () => {
      useAgentMessages();
      messagesRenderCount += 1;
      return null;
    };
    const RunProbe = () => {
      runStatus = useAgentRun().status;
      return null;
    };
    let renderer: ReactTestRenderer;

    await act(async () => {
      renderer = create(
        <AgentRuntimeProvider runtime={runtime}>
          <MessagesProbe />
          <RunProbe />
        </AgentRuntimeProvider>,
      );
    });
    await act(async () => {
      runtime.publish(snapshot({
        messages: initialMessages,
        run: { status: "running" },
      }));
    });

    expect(runStatus).toBe("running");
    expect(messagesRenderCount).toBe(1);
    await act(async () => renderer!.unmount());
  });

  it("unsubscribes the old Runtime and subscribes the replacement", async () => {
    const runtimeA = new TestAgentRuntime(snapshot());
    const runtimeB = new TestAgentRuntime(snapshot({
      conversation: { id: "conversation-b" },
      run: { status: "running" },
    }));
    const Probe = () => <span>{useAgentRun().status}</span>;
    let renderer: ReactTestRenderer;

    await act(async () => {
      renderer = create(
        <AgentRuntimeProvider runtime={runtimeA}><Probe /></AgentRuntimeProvider>,
      );
    });
    await act(async () => {
      renderer!.update(
        <AgentRuntimeProvider runtime={runtimeB}><Probe /></AgentRuntimeProvider>,
      );
    });

    expect(runtimeA.unsubscriptions).toBe(1);
    expect(runtimeB.subscriptions).toBe(1);
    expect(renderer!.root.findByType("span").children).toEqual(["running"]);
    await act(async () => renderer!.unmount());
  });

  it("delegates each runtime action exactly once", async () => {
    const runtime = new TestAgentRuntime(snapshot());
    let actions: AgentRuntimeActions | undefined;
    const Probe = () => {
      actions = useAgentRuntimeActions();
      return null;
    };
    renderToStaticMarkup(
      <AgentRuntimeProvider runtime={runtime}><Probe /></AgentRuntimeProvider>,
    );

    await actions!.sendMessage("hello");
    await actions!.resumeInterrupts([{
      interruptId: "approval",
      status: "resolved",
      payload: { approved: true },
    }]);
    await actions!.startNewConversation();
    actions!.abortRun();

    expect(runtime.sendMessage).toHaveBeenCalledOnce();
    expect(runtime.resumeInterrupts).toHaveBeenCalledOnce();
    expect(runtime.startNewConversation).toHaveBeenCalledOnce();
    expect(runtime.abort).toHaveBeenCalledOnce();
  });

  it("keeps Plugin Instance actions and events isolated", () => {
    const updateA = vi.fn();
    const updateB = vi.fn();
    const eventsA: UIPluginEvents = { subscribe: () => () => undefined };
    const eventsB: UIPluginEvents = { subscribe: () => () => undefined };
    const seen: Array<{
      id: string;
      actions: UIPluginActions;
      events: UIPluginEvents;
    }> = [];
    const Probe = () => {
      seen.push({
        id: usePluginInstance().id,
        actions: usePluginActions(),
        events: usePluginEvents(),
      });
      return null;
    };

    renderToStaticMarkup(
      <>
        <PluginInstanceProvider
          actions={pluginActions(updateA)}
          events={eventsA}
          instance={{ id: "a", pluginId: "probe", enabled: true }}
        ><Probe /></PluginInstanceProvider>
        <PluginInstanceProvider
          actions={pluginActions(updateB)}
          events={eventsB}
          instance={{ id: "b", pluginId: "probe", enabled: true }}
        ><Probe /></PluginInstanceProvider>
      </>,
    );

    seen[0]?.actions.updateInstanceProps({ collapsed: true });
    expect(seen.map(({ id }) => id)).toEqual(["a", "b"]);
    expect(seen[0]?.events).toBe(eventsA);
    expect(seen[1]?.events).toBe(eventsB);
    expect(updateA).toHaveBeenCalledOnce();
    expect(updateB).not.toHaveBeenCalled();
  });

  it("exposes execution and interrupt lifecycle without cleaning or reinterpretation", async () => {
    const runtime = new TestAgentRuntime(snapshot());
    let executions: ReturnType<typeof useAgentExecutions> = [];
    let interrupts: ReturnType<typeof useAgentInterrupts> = [];
    let run: ReturnType<typeof useAgentRun> = { status: "idle" };
    const Probe = () => {
      executions = useAgentExecutions();
      interrupts = useAgentInterrupts();
      run = useAgentRun();
      return null;
    };
    let renderer: ReactTestRenderer;
    await act(async () => {
      renderer = create(
        <AgentRuntimeProvider runtime={runtime}><Probe /></AgentRuntimeProvider>,
      );
    });
    const toolExecution = {
      type: "tool" as const,
      id: "tool-a",
      producer: { type: "root" as const },
      name: "search",
      arguments: "{}",
      status: "preparing" as const,
    };
    await act(async () => {
      runtime.publish(snapshot({
        executions: [toolExecution, {
          type: "reasoning",
          id: "reasoning-a",
          producer: { type: "root" },
          messageIds: ["reasoning-message"],
          status: "running",
        }],
        run: { status: "running" },
      }));
    });
    expect(executions.map((execution) => execution.status)).toEqual([
      "preparing",
      "running",
    ]);
    await act(async () => {
      runtime.publish(snapshot({
        executions: [{ ...toolExecution, status: "awaiting-result" }],
        run: { status: "running" },
      }));
    });
    expect(executions[0]?.status).toBe("awaiting-result");
    const completedExecutions = [
      {
        ...toolExecution,
        status: "completed" as const,
      },
      {
        type: "reasoning" as const,
        id: "reasoning-a",
        producer: { type: "root" as const },
        messageIds: ["reasoning-message"],
        status: "completed" as const,
      },
    ];
    await act(async () => {
      runtime.publish(snapshot({
        executions: completedExecutions,
        interrupts: [{
          id: "approval",
          producer: { type: "root" },
          reason: "tool-approval",
        }],
        run: { status: "awaiting-input" },
      }));
    });

    expect(executions).toBe(completedExecutions);
    expect(interrupts).toHaveLength(1);
    expect(run).toEqual({ status: "awaiting-input" });
    await act(async () => renderer!.unmount());
  });
});

function InstanceProbe() {
  usePluginInstance();
  return null;
}

function pluginActions(
  updateInstanceProps: UIPluginActions["updateInstanceProps"],
): UIPluginActions {
  return {
    sendMessage: async () => undefined,
    resumeInterrupts: async () => undefined,
    startNewConversation: async () => undefined,
    abortRun: () => undefined,
    updateInstanceProps,
  };
}
