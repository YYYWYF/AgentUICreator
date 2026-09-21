// @vitest-environment jsdom

import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  AgentRuntime,
  AgentRuntimeSnapshot,
} from "@agent-ui/runtime-core";

import { AgentRuntimeProvider } from "../runtime/context";
import { JobProgressPlugin } from "../plugins/job-progress";

const initialState = {
  jobProgress: {
    id: "ci-verification",
    title: "Verify the current change on CI",
    stages: [
      { name: "clone", weight: 1 },
      { name: "install", weight: 3 },
      { name: "build", weight: 3 },
      { name: "test", weight: 3 },
    ],
    stageIndex: 0,
    stageProgress: 0.1,
    eta: "about 4 min",
  },
};

function createRuntime(state: unknown) {
  let snapshot: AgentRuntimeSnapshot = {
    conversation: { id: "job-progress-test" },
    messages: [],
    state,
    run: { status: "running" },
    executions: [],
    interrupts: [],
  };
  const listeners = new Set<() => void>();
  const abort = vi.fn();
  const runtime: AgentRuntime = {
    mode: "test",
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    subscribeApplicationEvents: () => () => undefined,
    sendMessage: async () => undefined,
    resumeInterrupts: async () => undefined,
    startNewConversation: async () => undefined,
    abort,
    dispose: () => undefined,
  };
  return {
    runtime,
    publish(nextState: unknown) {
      snapshot = { ...snapshot, state: nextState };
      for (const listener of listeners) listener();
    },
    abort,
  };
}

const pluginProps = {
  renderSlot: () => null,
  renderScopedSlot: () => null,
};

const mountedRenderers: ReactTestRenderer[] = [];

afterEach(() => {
  for (const renderer of mountedRenderers.splice(0)) renderer.unmount();
});

describe("JobProgress Plugin", () => {
  it("projects runtime state into the official controlled Element and keeps its root", async () => {
    const harness = createRuntime(initialState);
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(
        <AgentRuntimeProvider runtime={harness.runtime}>
          <JobProgressPlugin {...pluginProps} />
        </AgentRuntimeProvider>,
      );
    });
    mountedRenderers.push(renderer);

    const initialRoot = renderer.root.findByProps({ "data-slot": "job-progress" });
    expect(initialRoot.findByProps({ role: "progressbar" }).props["aria-valuenow"])
      .toBe(1);
    expect(renderer.root.findByProps({ "aria-label": "Cancel the job" })).toBeDefined();

    await act(async () => {
      harness.publish({
        jobProgress: {
          ...initialState.jobProgress,
          stageIndex: 2,
          stageProgress: 0.55,
          eta: "about 2 min",
        },
      });
    });

    expect(renderer.root.findByProps({ "data-slot": "job-progress" })).toBe(initialRoot);
    expect(renderer.root.findByProps({ role: "progressbar" }).props["aria-valuenow"])
      .toBe(56.5);
    expect(renderer.root.findByProps({ children: "about 2 min" })).toBeDefined();

    await act(async () => {
      renderer.root.findByProps({ "aria-label": "Cancel the job" }).props.onClick();
    });
    expect(harness.abort).toHaveBeenCalledOnce();
  });

  it("keeps the official completion contract and removes Cancel after the final state", async () => {
    const harness = createRuntime({
      jobProgress: {
        ...initialState.jobProgress,
        stageIndex: 4,
        stageProgress: 0,
      },
    });
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(
        <AgentRuntimeProvider runtime={harness.runtime}>
          <JobProgressPlugin {...pluginProps} />
        </AgentRuntimeProvider>,
      );
    });
    mountedRenderers.push(renderer);

    expect(renderer.root.findByProps({ role: "progressbar" }).props["aria-valuenow"])
      .toBe(100);
    expect(renderer.root.findByProps({ children: "done" })).toBeDefined();
    expect(renderer.root.findAllByProps({ "aria-label": "Cancel the job" })).toHaveLength(0);
  });
});
