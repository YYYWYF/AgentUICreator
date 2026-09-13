// @vitest-environment jsdom

import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  AgentRuntime,
  AgentRuntimeSnapshot,
} from "@agent-ui/runtime-core";

import { AgentRuntimeProvider } from "../runtime/context";
import {
  buildScenarioSelectionUrl,
  consumeMockScenarioAutorunMarker,
  MOCK_SCENARIO_AUTORUN_STORAGE_KEY,
  MOCK_SCENARIO_AUTORUN_TRIGGER,
  ScenarioStudio,
  scenarioCatalogEndpoint,
  writeMockScenarioAutorunMarker,
} from "../src/dev/ScenarioStudio";

const catalog = {
  defaultScenarioId: "reasoning-tool-success",
  scenarios: [
    {
      id: "reasoning-tool-success",
      title: "Reasoning + Tool",
      description: "A normal reasoning and tool run.",
      category: "agent",
      capabilities: ["reasoning", "tool"],
    },
    {
      id: "subagents",
      title: "Subagents",
      description: "Dispatches three deterministic subagents.",
      category: "agent",
      capabilities: ["subagent"],
    },
  ],
};

function createRuntime(
  sendMessage = vi.fn(async () => undefined),
): AgentRuntime {
  const snapshot: AgentRuntimeSnapshot = {
    conversation: { id: "scenario-studio-test" },
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
    sendMessage,
    resumeInterrupts: async () => undefined,
    startNewConversation: async () => undefined,
    abort: () => undefined,
    dispose: () => undefined,
  };
}

function buttonWithText(
  renderer: ReactTestRenderer,
  text: string,
) {
  return renderer.root.findAllByType("button").find((button) =>
    button.children.includes(text),
  );
}

async function mountStudio({
  endpoint = "/__agent-ui/mock",
  navigate,
  runtime = createRuntime(),
}: {
  endpoint?: string;
  navigate?: (url: string) => void;
  runtime?: AgentRuntime;
} = {}) {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(
      <AgentRuntimeProvider runtime={runtime}>
        <ScenarioStudio endpoint={endpoint} navigate={navigate} />
      </AgentRuntimeProvider>,
    );
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
  return renderer;
}

async function openStudio(renderer: ReactTestRenderer): Promise<void> {
  await act(async () => {
    renderer.root.findByProps({
      "aria-label": "Open Mock Scenario Studio",
    }).props.onClick();
  });
}

async function flushAutorun(): Promise<void> {
  await act(async () => {
    await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
  });
}

describe("Scenario Studio", () => {
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

  it("loads its catalog from the Mock endpoint scenarios route", async () => {
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;

    const renderer = await mountStudio({
      endpoint: "/__agent-ui/mock?scenario=subagents&speed=1",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/__agent-ui/mock/scenarios",
      expect.objectContaining({ headers: { Accept: "application/json" } }),
    );
    expect(scenarioCatalogEndpoint(
      "https://agent.example/__agent-ui/mock?scenario=subagents",
    )).toBe("https://agent.example/__agent-ui/mock/scenarios");
    renderer.unmount();
  });

  it("writes the selected scenario and speed to the shareable URL", async () => {
    const navigate = vi.fn();
    const renderer = await mountStudio({ navigate });

    await openStudio(renderer);
    await act(async () => {
      renderer.root.findAllByProps({ "aria-pressed": false })[0]!.props.onClick();
      renderer.root.findByProps({ "aria-label": "Mock scenario speed" })
        .props.onChange({ target: { value: "0.5" } });
    });

    await act(async () => {
      buttonWithText(renderer, "Run Scenario")!.props.onClick();
    });

    expect(navigate).toHaveBeenCalledWith(
      "/?mockScenario=subagents&mockSpeed=0.5",
    );
    expect(window.sessionStorage.getItem(MOCK_SCENARIO_AUTORUN_STORAGE_KEY))
      .toBe("1");
  });

  it("keeps the fixed mock trigger on the normal Runtime sendMessage path", async () => {
    const sendMessage = vi.fn(async () => undefined);
    writeMockScenarioAutorunMarker();

    const renderer = await mountStudio({ runtime: createRuntime(sendMessage) });
    await flushAutorun();

    expect(sendMessage).toHaveBeenCalledOnce();
    expect(sendMessage).toHaveBeenCalledWith(MOCK_SCENARIO_AUTORUN_TRIGGER);
    renderer.unmount();
  });

  it("consumes the one-shot marker before starting the run", async () => {
    writeMockScenarioAutorunMarker();
    const sendMessage = vi.fn(async () => undefined);

    const renderer = await mountStudio({ runtime: createRuntime(sendMessage) });

    expect(window.sessionStorage.getItem(MOCK_SCENARIO_AUTORUN_STORAGE_KEY))
      .toBeNull();
    await flushAutorun();
    expect(sendMessage).toHaveBeenCalledOnce();
    renderer.unmount();
  });

  it("does not rerun after a second mount once the marker was consumed", async () => {
    writeMockScenarioAutorunMarker();
    const firstSendMessage = vi.fn(async () => undefined);
    const firstRenderer = await mountStudio({
      runtime: createRuntime(firstSendMessage),
    });
    await flushAutorun();
    firstRenderer.unmount();

    const secondSendMessage = vi.fn(async () => undefined);
    const secondRenderer = await mountStudio({
      runtime: createRuntime(secondSendMessage),
    });
    await flushAutorun();

    expect(firstSendMessage).toHaveBeenCalledOnce();
    expect(secondSendMessage).not.toHaveBeenCalled();
    secondRenderer.unmount();
  });

  it("restarts the current scenario through a fresh Runtime after reload", async () => {
    window.history.replaceState(
      null,
      "",
      "/?mockScenario=subagents&mockSpeed=1",
    );
    const navigate = vi.fn();
    const firstRenderer = await mountStudio({ navigate });

    await openStudio(firstRenderer);
    expect(buttonWithText(firstRenderer, "Restart Scenario")).toBeDefined();
    await act(async () => {
      buttonWithText(firstRenderer, "Restart Scenario")!.props.onClick();
    });
    expect(navigate).toHaveBeenCalledWith(
      "/?mockScenario=subagents&mockSpeed=1",
    );
    firstRenderer.unmount();

    const sendMessage = vi.fn(async () => undefined);
    const secondRenderer = await mountStudio({ runtime: createRuntime(sendMessage) });
    await flushAutorun();

    expect(sendMessage).toHaveBeenCalledOnce();
    secondRenderer.unmount();
  });

  it("never autoruns for a non-Mock endpoint", async () => {
    writeMockScenarioAutorunMarker();
    const sendMessage = vi.fn(async () => undefined);
    const renderer = await mountStudio({
      endpoint: "https://agent.example/api",
      runtime: createRuntime(sendMessage),
    });
    await flushAutorun();

    expect(sendMessage).not.toHaveBeenCalled();
    expect(window.sessionStorage.getItem(MOCK_SCENARIO_AUTORUN_STORAGE_KEY))
      .toBe("1");
    renderer.unmount();
  });

  it("builds a scenario URL without mixing transient autorun state into it", () => {
    window.history.replaceState(null, "", "/workspace?tab=conversation#run");

    expect(buildScenarioSelectionUrl("subagents", 1)).toBe(
      "/workspace?tab=conversation&mockScenario=subagents&mockSpeed=1#run",
    );
    expect(consumeMockScenarioAutorunMarker()).toBe(false);
  });
});
