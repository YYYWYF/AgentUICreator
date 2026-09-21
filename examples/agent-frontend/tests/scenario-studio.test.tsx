// @vitest-environment jsdom

import { StrictMode } from "react";
import {
  act,
  create,
  type ReactTestInstance,
  type ReactTestRenderer,
} from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  AgentRuntime,
  AgentRuntimeSnapshot,
} from "@agent-ui/runtime-core";

import { AgentRuntimeProvider } from "../runtime/context";
import {
  MOCK_SCENARIO_AUTORUN_STORAGE_KEY,
  MOCK_SCENARIO_AUTORUN_TRIGGER,
} from "../src/agent-endpoint";
import {
  buildScenarioSelectionUrl,
  consumeMockScenarioAutorunMarker,
  hasMockScenarioAutorunMarker,
  ScenarioPanel,
  scenarioCatalogEndpoint,
  writeMockScenarioAutorunMarker,
} from "../src/dev/DevStudio/ScenarioPanel";
import { DevStudio } from "../src/dev/DevStudio/DevStudio";

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
      title: "Parallel Agent Status",
      description: "Parallel dispatch status showcase.",
      category: "agent",
      capabilities: ["tool", "parallel-tool", "agent-status"],
    },
    {
      id: "nested-subagent-conversation",
      title: "AG-UI Subagent → Task Card",
      description: "Canonical nested Subagent reference.",
      category: "agent",
      capabilities: ["reasoning", "tool", "subagent"],
      reference: {
        protocol: "AG-UI",
        pattern: "Agents as Tools / Nested Subagent",
        presentation: "assistant-ui TaskCard",
        eventFlow: [
          "TOOL_CALL_START",
          "SUBAGENT_STARTED",
          "Child events tagged with subagentRunId",
          "TOOL_CALL_RESULT",
        ],
        notes: [
          "parentToolCallId attaches the subagent run to the spawning tool call.",
          "subagentRunId attributes child events to the subagent.",
        ],
      },
    },
    {
      id: "agent-state-sync",
      title: "AG-UI Agent State",
      description: "STATE_SNAPSHOT and STATE_DELTA JSON Patch state sync.",
      category: "state",
      capabilities: ["state-sync"],
      reference: {
        protocol: "AG-UI",
        pattern: "Agent State Synchronization",
        presentation: "Dev Studio Runtime / Application State",
        eventFlow: [
          "RUN_STARTED",
          "STATE_SNAPSHOT",
          "STATE_DELTA",
          "STATE_DELTA",
          "RUN_FINISHED",
        ],
        notes: [
          "STATE_SNAPSHOT replaces the complete external agent state.",
          "STATE_DELTA applies JSON Patch operations to the current state.",
          "AG-UI state is not AppUIModel or Plugin configuration.",
          "Run the scenario and watch Runtime → Application State.",
        ],
      },
    },
    {
      id: "nested-subagent-task-group",
      title: "AG-UI Subagent Task Group",
      description: "Sibling nested Subagents.",
      category: "agent",
      capabilities: ["tool", "subagent"],
    },
    {
      id: "nested-subagent-recursive",
      title: "Recursive AG-UI Subagents",
      description: "Recursive nested Subagents.",
      category: "agent",
      capabilities: ["reasoning", "tool", "subagent"],
    },
    {
      id: "nested-subagent-error",
      title: "AG-UI Subagent Error",
      description: "Attributed error case.",
      category: "agent",
      capabilities: ["tool", "subagent"],
    },
    {
      id: "subagent-lifecycle",
      title: "Subagent Lifecycle",
      description: "Protocol-only lifecycle fixture.",
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

function testInstanceText(instance: ReactTestInstance): string {
  return instance.children
    .map((child) => typeof child === "string" ? child : testInstanceText(child))
    .join("");
}

function scenarioButtonWithTitle(
  renderer: ReactTestRenderer,
  title: string,
): ReactTestInstance | undefined {
  return renderer.root.findAllByType("button").find((button) =>
    button.props["aria-pressed"] !== undefined &&
    button.findAllByType("strong").some((strong) => testInstanceText(strong) === title),
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
        <ScenarioPanel endpoint={endpoint} navigate={navigate} />
      </AgentRuntimeProvider>,
    );
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
  return renderer;
}

async function mountDevStudio({
  endpoint = "/__agent-ui/mock",
  runtime = createRuntime(),
  strictMode = false,
}: {
  endpoint?: string;
  runtime?: AgentRuntime;
  strictMode?: boolean;
} = {}) {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    const tree = (
      <AgentRuntimeProvider runtime={runtime}>
        <DevStudio endpoint={endpoint} />
      </AgentRuntimeProvider>
    );
    renderer = create(strictMode ? <StrictMode>{tree}</StrictMode> : tree);
    await Promise.resolve();
  });
  return renderer;
}

async function flushAutorun(): Promise<void> {
  await act(async () => {
    await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
  });
}

describe("Scenario Panel and Dev Studio autorun", () => {
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

  it("labels the Subagent catalog and explains the canonical AG-UI reference", async () => {
    const renderer = await mountStudio();

    expect(testInstanceText(scenarioButtonWithTitle(
      renderer,
      "AG-UI Subagent → Task Card",
    )!)).toContain("Recommended");
    expect(testInstanceText(scenarioButtonWithTitle(
      renderer,
      "AG-UI Subagent Task Group",
    )!)).toContain("Task Group");
    expect(testInstanceText(scenarioButtonWithTitle(
      renderer,
      "Recursive AG-UI Subagents",
    )!)).toContain("Advanced");
    expect(testInstanceText(scenarioButtonWithTitle(
      renderer,
      "AG-UI Subagent Error",
    )!)).toContain("Error Case");
    expect(testInstanceText(scenarioButtonWithTitle(
      renderer,
      "Subagent Lifecycle",
    )!)).toContain("Protocol Only");
    expect(testInstanceText(scenarioButtonWithTitle(
      renderer,
      "Parallel Agent Status",
    )!)).toContain("Element Demo");

    await act(async () => {
      scenarioButtonWithTitle(renderer, "AG-UI Subagent → Task Card")?.props.onClick();
    });

    const panelText = testInstanceText(renderer.root);
    expect(panelText).toContain("AG-UI");
    expect(panelText).toContain("Agents as Tools / Nested Subagent");
    expect(panelText).toContain("assistant-ui TaskCard");
    expect(panelText).toContain("SUBAGENT_STARTED");
    expect(panelText).toContain("subagentRunId");
    expect(panelText).toContain("parentToolCallId");
    renderer.unmount();
  });

  it("labels the Agent State catalog and explains snapshot/delta observation", async () => {
    const renderer = await mountStudio();

    expect(testInstanceText(scenarioButtonWithTitle(
      renderer,
      "AG-UI Agent State",
    )!)).toContain("Recommended");

    await act(async () => {
      scenarioButtonWithTitle(renderer, "AG-UI Agent State")?.props.onClick();
    });

    const panelText = testInstanceText(renderer.root);
    expect(panelText).toContain("State");
    expect(panelText).toContain("State Sync");
    expect(panelText).toContain("Agent State Synchronization");
    expect(panelText).toContain("Dev Studio Runtime / Application State");
    expect(panelText).toContain("STATE_SNAPSHOT");
    expect(panelText).toContain("STATE_DELTA");
    expect(panelText).toContain("JSON Patch");
    expect(panelText).toContain("AppUIModel");
    renderer.unmount();
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

    const renderer = await mountDevStudio({ runtime: createRuntime(sendMessage) });
    await flushAutorun();

    expect(sendMessage).toHaveBeenCalledOnce();
    expect(sendMessage).toHaveBeenCalledWith(MOCK_SCENARIO_AUTORUN_TRIGGER);
    renderer.unmount();
  });

  it("consumes the one-shot marker when the timer starts the run", async () => {
    writeMockScenarioAutorunMarker();
    const sendMessage = vi.fn(async () => undefined);

    const renderer = await mountDevStudio({ runtime: createRuntime(sendMessage) });

    expect(hasMockScenarioAutorunMarker()).toBe(true);
    await flushAutorun();
    expect(sendMessage).toHaveBeenCalledOnce();
    expect(hasMockScenarioAutorunMarker()).toBe(false);
    renderer.unmount();
  });

  it("autoruns exactly once through Runtime under StrictMode", async () => {
    writeMockScenarioAutorunMarker();
    const sendMessage = vi.fn(async () => undefined);

    const renderer = await mountDevStudio({
      endpoint: "/__agent-ui/mock?scenario=subagents&speed=1",
      runtime: createRuntime(sendMessage),
      strictMode: true,
    });
    await flushAutorun();

    expect(sendMessage).toHaveBeenCalledOnce();
    expect(sendMessage).toHaveBeenCalledWith(MOCK_SCENARIO_AUTORUN_TRIGGER);
    expect(hasMockScenarioAutorunMarker()).toBe(false);
    renderer.unmount();
  });

  it("does not rerun after a second mount once the marker was consumed", async () => {
    writeMockScenarioAutorunMarker();
    const firstSendMessage = vi.fn(async () => undefined);
    const firstRenderer = await mountDevStudio({
      runtime: createRuntime(firstSendMessage),
    });
    await flushAutorun();
    firstRenderer.unmount();

    const secondSendMessage = vi.fn(async () => undefined);
    const secondRenderer = await mountDevStudio({
      runtime: createRuntime(secondSendMessage),
      strictMode: true,
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

    expect(buttonWithText(firstRenderer, "Restart Scenario")).toBeDefined();
    await act(async () => {
      buttonWithText(firstRenderer, "Restart Scenario")!.props.onClick();
    });
    expect(navigate).toHaveBeenCalledWith(
      "/?mockScenario=subagents&mockSpeed=1",
    );
    firstRenderer.unmount();

    const sendMessage = vi.fn(async () => undefined);
    const secondRenderer = await mountDevStudio({
      endpoint: "/__agent-ui/mock?scenario=subagents&speed=1",
      runtime: createRuntime(sendMessage),
      strictMode: true,
    });
    await flushAutorun();

    expect(sendMessage).toHaveBeenCalledOnce();
    expect(hasMockScenarioAutorunMarker()).toBe(false);
    secondRenderer.unmount();
  });

  it("runs a selected scenario after Run Scenario navigation and StrictMode reload", async () => {
    const renderer = await mountStudio({
      navigate: (url) => window.history.replaceState(null, "", url),
    });

    await act(async () => {
      renderer.root.findAllByProps({ "aria-pressed": false })[0]!.props.onClick();
    });
    await act(async () => {
      buttonWithText(renderer, "Run Scenario")!.props.onClick();
    });
    renderer.unmount();

    const sendMessage = vi.fn(async () => undefined);
    const reloadedRenderer = await mountDevStudio({
      endpoint: "/__agent-ui/mock?scenario=subagents&speed=1",
      runtime: createRuntime(sendMessage),
      strictMode: true,
    });
    await flushAutorun();

    expect(sendMessage).toHaveBeenCalledOnce();
    expect(sendMessage).toHaveBeenCalledWith(MOCK_SCENARIO_AUTORUN_TRIGGER);
    expect(hasMockScenarioAutorunMarker()).toBe(false);
    reloadedRenderer.unmount();
  });

  it("never autoruns for a non-Mock endpoint", async () => {
    writeMockScenarioAutorunMarker();
    const sendMessage = vi.fn(async () => undefined);
    const renderer = await mountDevStudio({
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
