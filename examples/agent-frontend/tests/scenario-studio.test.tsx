// @vitest-environment jsdom

import { act as domAct, StrictMode, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
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
  MOCK_SCENARIO_AUTORUN_TRIGGER,
  type MockScenarioSelection,
} from "../src/agent-endpoint";
import {
  ScenarioPanel,
  scenarioCatalogEndpoint,
} from "../src/dev/DevStudio/ScenarioPanel";
import { DevStudio } from "../src/dev/DevStudio/DevStudio";

const catalog = {
  defaultScenarioId: "reasoning-tool-success",
  scenarios: [
    {
      id: "simple-chat",
      title: "Simple Chat",
      description: "A minimal text streaming run.",
      category: "basics",
      capabilities: [],
      reference: { audience: "backend" },
    },
    {
      id: "reasoning-chat",
      title: "Reasoning + Message",
      description: "Reasoning followed by an answer.",
      category: "basics",
      capabilities: ["reasoning"],
      reference: { audience: "backend" },
    },
    {
      id: "reasoning-tool-success",
      title: "Reasoning → Tool → Answer",
      description: "A normal reasoning and tool run.",
      category: "basics",
      capabilities: ["reasoning", "tool"],
      reference: { audience: "backend", level: "recommended" },
    },
    {
      id: "parallel-tools",
      title: "Parallel Tools",
      description: "Parallel Tool Calls.",
      category: "tools",
      capabilities: ["tool", "parallel-tool"],
      reference: { audience: "backend" },
    },
    {
      id: "tool-error",
      title: "Run Error During Tool",
      description: "A run fails with standard RUN_ERROR during a Tool Call.",
      category: "tools",
      capabilities: ["tool", "run-error"],
      reference: { audience: "backend" },
    },
    {
      id: "approval-resume",
      title: "AG-UI Tool Approval",
      description: "Human in the Loop · Allow / Deny → Resume",
      category: "human-in-loop",
      capabilities: ["reasoning", "tool", "approval"],
      reference: { audience: "backend" },
    },
    {
      id: "nested-subagent-conversation",
      title: "AG-UI Subagent → Task Card",
      description: "Canonical nested Subagent reference.",
      category: "multi-agent",
      capabilities: ["reasoning", "tool", "subagent"],
      reference: {
        audience: "backend",
        protocol: "AG-UI",
        pattern: "Agents as Tools / Nested Subagent",
        presentation: "assistant-ui TaskCard",
        level: "recommended",
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
      title: "AG-UI State → Job Progress",
      description: "A run_ci_job ToolCall anchors a CI Job while STATE_DELTA advances its live progress.",
      category: "state",
      capabilities: ["state-sync"],
      reference: {
        audience: "backend",
        level: "recommended",
        protocol: "AG-UI",
        pattern: "Live Job State Synchronization",
        presentation: "assistant-ui JobProgress + Dev Studio Runtime State",
        eventFlow: [
          "RUN_STARTED",
          "STATE_SNAPSHOT",
          "TOOL_CALL_START",
          "TOOL_CALL_ARGS",
          "TOOL_CALL_END",
          "STATE_DELTA",
          "STATE_DELTA",
          "STATE_DELTA",
          "STATE_DELTA",
          "STATE_DELTA",
          "TOOL_CALL_RESULT",
          "TEXT_MESSAGE_START/CONTENT/END",
          "RUN_FINISHED",
        ],
        notes: [
          "The run_ci_job ToolCall anchors the job in the conversation transcript and gives it an identity.",
          "STATE_SNAPSHOT initializes the dynamic state associated with ci-job-1.",
          "STATE_DELTA updates jobs[toolCallId] while the ToolCall is still running.",
          "STATE_DELTA carries standard JSON Patch operations for each stage update.",
          "TOOL_CALL_RESULT reports the one-shot terminal outcome after the live state settles.",
          "ToolCall and State solve different problems and can be combined.",
          "Use ToolCall for the action, STATE_* for mutable state, and TOOL_CALL_RESULT for the terminal result.",
          "State lifecycle and UI placement are separate: this CI job belongs in the ToolCall transcript, not a global status area.",
          "JobProgress is used through the mock toolkit's named Tool UI and official assistant-ui facade.",
          "The latest state is included in the next AG-UI run input.",
          "Dev Studio → Runtime → Application State shows the raw current state.",
          "AG-UI state is not AppUIModel, app-ui.json, Plugin configuration, ConversationService, conversation persistence, or Creator working state.",
        ],
      },
    },
    {
      id: "nested-subagent-task-group",
      title: "AG-UI Subagent Task Group",
      description: "Sibling nested Subagents.",
      category: "multi-agent",
      capabilities: ["tool", "subagent"],
      reference: { audience: "frontend", level: "advanced" },
    },
    {
      id: "agent-plan",
      title: "Application-defined Tool Args → AgentPlan",
      description: "Application-defined tool args rendered with AgentPlan.",
      category: "presentation",
      capabilities: ["tool", "plan"],
      reference: {
        audience: "frontend",
        protocol: "AG-UI Tool Call",
        pattern: "Application-defined Tool Args → AgentPlan",
        presentation: "assistant-ui AgentPlan",
        notes: [
          "AG-UI does not define an AgentPlan event. This scenario demonstrates an application-defined tool args contract rendered with assistant-ui AgentPlan.",
        ],
      },
    },
    {
      id: "agent-status",
      title: "Application-defined Tool Args → AgentStatus",
      description: "Application-defined tool args rendered with AgentStatus.",
      category: "presentation",
      capabilities: ["tool", "agent-status"],
      reference: {
        audience: "frontend",
        protocol: "AG-UI Tool Call",
        pattern: "Application-defined Tool Args → AgentStatus",
        presentation: "assistant-ui AgentStatus",
        notes: [
          "AG-UI does not define an AgentStatus event. This scenario demonstrates an application-defined tool args contract rendered with assistant-ui AgentStatus.",
        ],
      },
    },
    {
      id: "nested-subagent-recursive",
      title: "Recursive AG-UI Subagents",
      description: "Recursive nested Subagents.",
      category: "advanced",
      capabilities: ["reasoning", "tool", "subagent"],
      reference: { audience: "frontend", level: "advanced" },
    },
    {
      id: "nested-subagent-error",
      title: "AG-UI Subagent Error",
      description: "Attributed error case.",
      category: "advanced",
      capabilities: ["tool", "subagent"],
      reference: { audience: "frontend", level: "edge" },
    },
    {
      id: "subagent-lifecycle",
      title: "Subagent Lifecycle",
      description: "Internal regression fixture.",
      category: "advanced",
      capabilities: ["subagent"],
      reference: { audience: "internal", level: "protocol" },
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

function createControllableRuntime(): {
  abort: ReturnType<typeof vi.fn>;
  runtime: AgentRuntime;
} {
  let snapshot: AgentRuntimeSnapshot = {
    conversation: { id: "scenario-studio-controllable-test" },
    messages: [],
    state: undefined,
    run: { status: "idle" },
    executions: [],
    interrupts: [],
  };
  const listeners = new Set<() => void>();
  const publish = (status: "idle" | "running") => {
    snapshot = { ...snapshot, run: { status } };
    listeners.forEach((listener) => listener());
  };
  const abort = vi.fn(() => publish("idle"));

  return {
    abort,
    runtime: {
      mode: "test",
      getSnapshot: () => snapshot,
      subscribe: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      subscribeApplicationEvents: () => () => undefined,
      sendMessage: vi.fn(async () => publish("running")),
      resumeInterrupts: async () => undefined,
      startNewConversation: async () => undefined,
      abort,
      dispose: () => undefined,
    },
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
  currentSelection,
  endpoint = "/__agent-ui/mock",
  onRun,
  runtime = createRuntime(),
}: {
  currentSelection?: MockScenarioSelection;
  endpoint?: string;
  onRun?: (selection: MockScenarioSelection) => void;
  runtime?: AgentRuntime;
} = {}) {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(
      <AgentRuntimeProvider runtime={runtime}>
        <ScenarioPanel
          currentSelection={currentSelection}
          endpoint={endpoint}
          onRun={onRun}
        />
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
  mockRunRevision = 0,
  mockSelection,
  onMockScenarioRun,
  runtime = createRuntime(),
  strictMode = false,
}: {
  endpoint?: string;
  mockRunRevision?: number;
  mockSelection?: MockScenarioSelection;
  onMockScenarioRun?: (selection: MockScenarioSelection) => void;
  runtime?: AgentRuntime;
  strictMode?: boolean;
} = {}) {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    const tree = (
      <AgentRuntimeProvider runtime={runtime}>
        <DevStudio
          endpoint={endpoint}
          mockRunRevision={mockRunRevision}
          mockSelection={mockSelection}
          onMockScenarioRun={onMockScenarioRun}
        />
      </AgentRuntimeProvider>
    );
    renderer = create(strictMode ? <StrictMode>{tree}</StrictMode> : tree);
    await Promise.resolve();
  });
  return renderer;
}

function MockDevStudioHarness({
  runtime,
}: {
  runtime: AgentRuntime;
}) {
  const [mockSelection, setMockSelection] = useState<MockScenarioSelection>();
  const [mockRunRevision, setMockRunRevision] = useState(0);
  const endpoint = mockSelection === undefined
    ? "/__agent-ui/mock"
    : `/__agent-ui/mock?scenario=${encodeURIComponent(mockSelection.scenarioId)}&speed=${mockSelection.speed}`;

  return (
    <AgentRuntimeProvider runtime={runtime}>
      <DevStudio
        endpoint={endpoint}
        mockRunRevision={mockRunRevision}
        mockSelection={mockSelection}
        onMockScenarioRun={(selection) => {
          setMockSelection(selection);
          setMockRunRevision((current) => current + 1);
        }}
      />
    </AgentRuntimeProvider>
  );
}

interface MountedMockDevStudio {
  dock: HTMLDivElement;
  panelHost: HTMLDivElement;
  root: Root;
  container: HTMLDivElement;
}

async function mountMockDevStudioInCreatorHost(
  runtime: AgentRuntime,
): Promise<MountedMockDevStudio> {
  const container = document.createElement("div");
  const dock = document.createElement("div");
  const panelHost = document.createElement("div");
  dock.dataset.slot = "agent-ui-dev-studio-dock";
  panelHost.dataset.slot = "agent-ui-dev-studio-panel";
  document.body.append(dock, panelHost, container);
  const root = createRoot(container);

  await domAct(async () => {
    root.render(<MockDevStudioHarness runtime={runtime} />);
    await Promise.resolve();
    await Promise.resolve();
  });

  return { container, dock, panelHost, root };
}

function unmountMockDevStudio(mounted: MountedMockDevStudio): void {
  mounted.root.unmount();
  mounted.container.remove();
  mounted.dock.remove();
  mounted.panelHost.remove();
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
    )!)).toContain("Backend Reference");
    expect(testInstanceText(scenarioButtonWithTitle(
      renderer,
      "AG-UI Subagent → Task Card",
    )!)).toContain("Recommended");
    expect(testInstanceText(scenarioButtonWithTitle(
      renderer,
      "AG-UI Subagent Task Group",
    )!)).toContain("Advanced");
    expect(testInstanceText(scenarioButtonWithTitle(
      renderer,
      "Recursive AG-UI Subagents",
    )!)).toContain("Advanced");
    expect(testInstanceText(scenarioButtonWithTitle(
      renderer,
      "AG-UI Subagent Error",
    )!)).toContain("Edge case");

    await act(async () => {
      scenarioButtonWithTitle(renderer, "AG-UI Subagent → Task Card")?.props.onClick();
    });

    const panelText = testInstanceText(renderer.root);
    expect(panelText).toContain("Backend Reference Profile");
    expect(panelText).toContain("AG-UI 0.0.59");
    expect(panelText).toContain("TOOL_CALL_ARGS.delta is streamed text");
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
      "AG-UI State → Job Progress",
    )!)).toContain("Recommended");

    await act(async () => {
      scenarioButtonWithTitle(renderer, "AG-UI State → Job Progress")?.props.onClick();
    });

    const panelText = testInstanceText(renderer.root);
    expect(panelText).toContain("State");
    expect(panelText).toContain("State Sync");
    expect(panelText).toContain("Live Job State Synchronization");
    expect(panelText).toContain("assistant-ui JobProgress + Dev Studio Runtime State");
    expect(panelText).toContain("STATE_SNAPSHOT");
    expect(panelText).toContain("STATE_DELTA");
    expect(panelText).toContain("JSON Patch");
    expect(panelText).toContain("AppUIModel");
    renderer.unmount();
  });

  it("loads its catalog from the Mock endpoint scenarios route", async () => {
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;

    const renderer = await mountStudio({
      endpoint: "/__agent-ui/mock?scenario=nested-subagent-conversation&speed=1",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/__agent-ui/mock/scenarios",
      expect.objectContaining({ headers: { Accept: "application/json" } }),
    );
    expect(scenarioCatalogEndpoint(
      "https://agent.example/__agent-ui/mock?scenario=nested-subagent-conversation",
    )).toBe("https://agent.example/__agent-ui/mock/scenarios");
    renderer.unmount();
  });

  it("keeps internal regression fixtures out of the ordinary selector", async () => {
    const renderer = await mountStudio();

    expect(scenarioButtonWithTitle(renderer, "Subagent Lifecycle")).toBeUndefined();
    renderer.unmount();
  });

  it("keeps the selected scenario and speed in the current page state", async () => {
    const onRun = vi.fn();
    const renderer = await mountStudio({ onRun });

    await act(async () => {
      scenarioButtonWithTitle(renderer, "Simple Chat")?.props.onClick();
      renderer.root.findByProps({ "aria-label": "Mock scenario speed" })
        .props.onChange({ target: { value: "0.5" } });
    });

    await act(async () => {
      buttonWithText(renderer, "Run Scenario")!.props.onClick();
    });

    expect(onRun).toHaveBeenCalledWith({ scenarioId: "simple-chat", speed: 0.5 });
    expect(window.location.search).toBe("");
    renderer.unmount();
  });

  it("keeps the fixed mock trigger on the normal Runtime sendMessage path", async () => {
    const sendMessage = vi.fn(async () => undefined);

    const renderer = await mountDevStudio({
      mockRunRevision: 1,
      runtime: createRuntime(sendMessage),
    });
    await flushAutorun();

    expect(sendMessage).toHaveBeenCalledOnce();
    expect(sendMessage).toHaveBeenCalledWith(MOCK_SCENARIO_AUTORUN_TRIGGER);
    renderer.unmount();
  });

  it("shows a loading stop action and aborts the active Runtime run", async () => {
    const { abort, runtime } = createControllableRuntime();
    const renderer = await mountStudio({
      currentSelection: { scenarioId: "reasoning-tool-success", speed: 1 },
      endpoint: "/__agent-ui/mock?scenario=reasoning-tool-success&speed=1",
      runtime,
    });

    expect(buttonWithText(renderer, "Restart Scenario")).toBeDefined();
    await act(async () => {
      await runtime.sendMessage("Run mock scenario.");
    });

    const stopButton = renderer.root.findByProps({
      "aria-label": "Stop running scenario",
    });
    expect(stopButton.props["aria-busy"]).toBe(true);
    expect(stopButton.findAllByType("span").length).toBeGreaterThan(0);
    expect(renderer.root.findByProps({ "aria-label": "Mock scenario speed" }).props.disabled)
      .toBe(true);
    expect(scenarioButtonWithTitle(renderer, "Simple Chat")?.props.disabled)
      .toBe(true);

    await act(async () => {
      stopButton.props.onClick();
    });

    expect(abort).toHaveBeenCalledOnce();
    expect(buttonWithText(renderer, "Restart Scenario")).toBeDefined();
    renderer.unmount();
  });

  it("does not autorun on a fresh Mock mount", async () => {
    const sendMessage = vi.fn(async () => undefined);

    const renderer = await mountDevStudio({ runtime: createRuntime(sendMessage) });
    await flushAutorun();
    expect(sendMessage).not.toHaveBeenCalled();
    renderer.unmount();
  });

  it("autoruns exactly once through Runtime under StrictMode", async () => {
    const sendMessage = vi.fn(async () => undefined);

    const renderer = await mountDevStudio({
      endpoint: "/__agent-ui/mock?scenario=nested-subagent-conversation&speed=1",
      mockRunRevision: 1,
      runtime: createRuntime(sendMessage),
      strictMode: true,
    });
    await flushAutorun();

    expect(sendMessage).toHaveBeenCalledOnce();
    expect(sendMessage).toHaveBeenCalledWith(MOCK_SCENARIO_AUTORUN_TRIGGER);
    renderer.unmount();
  });

  it("runs the same scenario again when the in-memory revision changes", async () => {
    const firstSendMessage = vi.fn(async () => undefined);
    const firstRenderer = await mountDevStudio({
      mockRunRevision: 1,
      runtime: createRuntime(firstSendMessage),
    });
    await flushAutorun();
    firstRenderer.unmount();

    const secondSendMessage = vi.fn(async () => undefined);
    const secondRenderer = await mountDevStudio({
      mockRunRevision: 2,
      runtime: createRuntime(secondSendMessage),
      strictMode: true,
    });
    await flushAutorun();

    expect(firstSendMessage).toHaveBeenCalledOnce();
    expect(secondSendMessage).toHaveBeenCalledOnce();
    secondRenderer.unmount();
  });

  it("runs and restarts in place without changing the browser URL", async () => {
    const sendMessage = vi.fn(async () => undefined);
    const mounted = await mountMockDevStudioInCreatorHost(
      createRuntime(sendMessage),
    );

    await domAct(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    await domAct(async () => {
      mounted.dock.querySelector<HTMLButtonElement>(
        '[aria-label="Open Mock Agent panel"]',
      )?.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    await domAct(async () => {
      mounted.panelHost.querySelector<HTMLButtonElement>(
        'button[aria-pressed="false"]',
      )?.click();
    });
    const findButton = (text: string) => [
      ...mounted.panelHost.querySelectorAll("button"),
    ].find((button) => button.textContent?.includes(text));
    expect(findButton("Run Scenario")).toBeDefined();

    await domAct(async () => {
      findButton("Run Scenario")?.click();
    });
    await new Promise<void>((resolve) => window.setTimeout(resolve, 0));

    expect(sendMessage).toHaveBeenCalledOnce();
    expect(sendMessage).toHaveBeenCalledWith(MOCK_SCENARIO_AUTORUN_TRIGGER);
    expect(window.location.search).toBe("");
    expect(findButton("Restart Scenario")).toBeDefined();
    expect(mounted.dock.querySelector(
      '[aria-label="Close Mock Agent panel"]',
    )).not.toBeNull();
    await domAct(async () => {
      findButton("Restart Scenario")?.click();
    });
    await new Promise<void>((resolve) => window.setTimeout(resolve, 0));

    expect(sendMessage).toHaveBeenCalledTimes(2);
    expect(sendMessage).toHaveBeenCalledWith(MOCK_SCENARIO_AUTORUN_TRIGGER);
    expect(window.location.search).toBe("");
    expect(findButton("Restart Scenario")).toBeDefined();
    expect(mounted.dock.querySelector(
      '[aria-label="Close Mock Agent panel"]',
    )).not.toBeNull();
    unmountMockDevStudio(mounted);
  });

  it("never autoruns for a non-Mock endpoint", async () => {
    const sendMessage = vi.fn(async () => undefined);
    const renderer = await mountDevStudio({
      endpoint: "https://agent.example/api",
      mockRunRevision: 1,
      runtime: createRuntime(sendMessage),
    });
    await flushAutorun();

    expect(sendMessage).not.toHaveBeenCalled();
    renderer.unmount();
  });
});
