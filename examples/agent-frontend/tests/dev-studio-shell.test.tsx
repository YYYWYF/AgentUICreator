// @vitest-environment jsdom

import {
  act,
  create,
  type ReactTestRenderer,
} from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  AgentRuntime,
  AgentRuntimeSnapshot,
} from "@agent-ui/runtime-core";

vi.mock("../src/dev/DevStudio/RuntimePanel", () => ({
  RuntimePanel: () => <div>Runtime panel</div>,
}));

import { AgentRuntimeProvider } from "../runtime/context";
import { DevStudio } from "../src/dev/DevStudio/DevStudio";

const catalog = {
  defaultScenarioId: "nested-subagent-conversation",
  scenarios: [
    {
      id: "nested-subagent-conversation",
      title: "AG-UI Subagent → Task Card",
      description: "Renders a standard nested Subagent conversation.",
      category: "multi-agent",
      capabilities: ["subagent"],
    },
  ],
};

function createRuntime(): AgentRuntime {
  const snapshot: AgentRuntimeSnapshot = {
    conversation: { id: "dev-studio-test" },
    messages: [],
    state: undefined,
    run: { status: "idle" },
    executions: [],
    interrupts: [],
  };
  return {
    mode: "test",
    getSnapshot: () => snapshot,
    subscribe: () => () => undefined,
    subscribeApplicationEvents: () => () => undefined,
    sendMessage: async () => undefined,
    resumeInterrupts: async () => undefined,
    startNewConversation: async () => undefined,
    abort: () => undefined,
    dispose: () => undefined,
  };
}

describe("Agent UI Dev Studio shell", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/");
    window.sessionStorage.clear();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => catalog,
      })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows Scenario and Runtime tabs for Mock development", async () => {
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(
        <AgentRuntimeProvider runtime={createRuntime()}>
          <DevStudio endpoint="/__agent-ui/mock" />
        </AgentRuntimeProvider>,
      );
    });

    await act(async () => {
      renderer.root.findByProps({
        "aria-label": "Open Mock Agent panel",
      }).props.onClick();
    });

    expect(renderer.root.findAllByProps({ role: "tab" })).toHaveLength(2);
    expect(renderer.root.findAllByProps({ children: "Scenario" })).toHaveLength(1);
    expect(renderer.root.findAllByProps({ children: "Runtime" })).toHaveLength(1);
    expect(renderer.root.findAllByProps({ "aria-modal": "true" })).toHaveLength(0);
    expect(renderer.root.findAllByProps({ role: "dialog" })).toHaveLength(0);

    await act(async () => {
      renderer.root.findByProps({
        "aria-label": "Close Mock Agent panel",
      }).props.onClick();
    });

    expect(renderer.root.findAllByProps({ role: "tab" })).toHaveLength(0);
  });

  it("shows only Runtime for a real development endpoint", async () => {
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(
        <AgentRuntimeProvider runtime={createRuntime()}>
          <DevStudio endpoint="https://agent.example/api" />
        </AgentRuntimeProvider>,
      );
    });

    await act(async () => {
      renderer.root.findByProps({
        "aria-label": "Open Agent UI Dev Studio",
      }).props.onClick();
    });

    expect(renderer.root.findAllByProps({ role: "tab" })).toHaveLength(0);
    expect(JSON.stringify(renderer.toJSON())).toContain("Runtime panel");
    expect(JSON.stringify(renderer.toJSON())).not.toContain("Scenario");
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("starts collapsed after a page reload and stays open until the user closes it", async () => {
    let firstRenderer!: ReactTestRenderer;
    await act(async () => {
      firstRenderer = create(
        <AgentRuntimeProvider runtime={createRuntime()}>
          <DevStudio endpoint="/__agent-ui/mock" />
        </AgentRuntimeProvider>,
      );
    });

    await act(async () => {
      firstRenderer.root.findByProps({
        "aria-label": "Open Mock Agent panel",
      }).props.onClick();
    });
    firstRenderer.unmount();

    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(
        <AgentRuntimeProvider runtime={createRuntime()}>
          <DevStudio endpoint="/__agent-ui/mock" />
        </AgentRuntimeProvider>,
      );
    });

    expect(renderer.root.findByProps({
      "aria-label": "Open Mock Agent panel",
    })).toBeDefined();

    await act(async () => {
      renderer.root.findByProps({
        "aria-label": "Open Mock Agent panel",
      }).props.onClick();
    });

    expect(renderer.root.findByProps({
      "aria-label": "Close Mock Agent panel",
    })).toBeDefined();

    await act(async () => {
      renderer.root.findByProps({
        "aria-label": "Close Mock Agent panel",
      }).props.onClick();
    });
    expect(renderer.root.findByProps({
      "aria-label": "Open Mock Agent panel",
    })).toBeDefined();
  });
});
