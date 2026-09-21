// @vitest-environment jsdom

import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ToolCallMessagePartProps } from "@assistant-ui/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  MockAgentPlanToolUI,
  MockAgentStatusToolUI,
  MockDispatchSubagentToolUI,
  MockRunCiJobToolUI,
  createConversationToolkit,
} from "../agent-ui/conversation/toolkit";
import {
  isEligibleSubagentToolCall,
  projectSubagentToolCalls,
  type SubagentToolCallPart,
} from "../agent-ui/conversation/agents/subagent-projection";

type MockToolProps = ToolCallMessagePartProps<Record<string, unknown>, unknown>;
const mountedRoots: Root[] = [];

function createProps(
  result: unknown,
  overrides: Partial<MockToolProps> = {},
): MockToolProps {
  return {
    type: "tool-call",
    toolCallId: "mock-tool-1",
    toolName: "mock_tool",
    args: {},
    argsText: "{}",
    result,
    status: { type: "complete" },
    addResult: () => undefined,
    resume: () => undefined,
    respondToApproval: async () => undefined,
    ...overrides,
  };
}

async function renderTool(element: ReactElement) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  mountedRoots.push(root);
  await act(async () => root.render(element));
  return container;
}

afterEach(async () => {
  await act(async () => {
    for (const root of mountedRoots.splice(0)) root.unmount();
  });
  document.body.replaceChildren();
});

describe("Mock Agent official element renderers", () => {
  it("registers mock-only backend tools without changing production toolkit", () => {
    const production = createConversationToolkit();
    const mock = createConversationToolkit({ mockAgentElements: true });

    expect(production).not.toHaveProperty("mock_agent_plan");
    expect(production).not.toHaveProperty("mock_agent_status");
    expect(production).not.toHaveProperty("mock_dispatch_subagent");
    expect(production).not.toHaveProperty("run_ci_job");
    const mockAgentPlan = mock.mock_agent_plan;
    const mockAgentStatus = mock.mock_agent_status;
    const mockDispatchSubagent = mock.mock_dispatch_subagent;
    const mockRunCiJob = mock.run_ci_job;
    expect(mockAgentPlan).toBeDefined();
    expect(mockAgentStatus).toBeDefined();
    expect(mockDispatchSubagent).toBeDefined();
    expect(mockRunCiJob).toBeDefined();
    if (
      mockAgentPlan === undefined ||
      mockAgentStatus === undefined ||
      mockDispatchSubagent === undefined ||
      mockRunCiJob === undefined
    ) {
      throw new Error("Mock Agent Elements toolkit entries are missing.");
    }
    expect(mockAgentPlan.type).toBe("backend");
    expect(mockAgentStatus.type).toBe("backend");
    expect(mockDispatchSubagent.type).toBe("backend");
    expect(mockRunCiJob.type).toBe("backend");
    expect(mockDispatchSubagent.render).toBe(MockDispatchSubagentToolUI);
    expect(mockRunCiJob.render).toBe(MockRunCiJobToolUI);
    expect("execute" in mockAgentPlan).toBe(false);
  });

  it("renders the official AgentPlan from the shared projection", async () => {
    const container = await renderTool(
      <MockAgentPlanToolUI {...createProps({
        steps: ["Inspect", "Compare", "Update"],
        activeIndex: 1,
      })} />,
    );

    expect(container.querySelector('[data-slot="agent-plan"]')).not.toBeNull();
    expect(container.textContent).toContain("Inspect");
    expect(container.textContent).toContain("1 of 3");
  });

  it("renders official AgentStatus states from explicit values", async () => {
    const fixtures = [
      { state: "working", label: "Analyzing workspace", elapsed: "0:12" },
      { state: "waiting", label: "Waiting for approval", elapsed: "0:13" },
      { state: "done", label: "Analysis complete", elapsed: "0:24" },
    ] as const;

    for (const fixture of fixtures) {
      const container = await renderTool(
        <MockAgentStatusToolUI {...createProps(fixture)} />,
      );

      expect(container.querySelector('[data-slot="agent-status"]'))
        .not.toBeNull();
      expect(container.textContent).toContain(fixture.state);
      expect(container.textContent).toContain(fixture.label);
      if (fixture.state !== "done") {
        expect(container.textContent).toContain(fixture.elapsed);
      }
    }
  });

  it("projects separate dispatch calls into one aggregate view", () => {
    const parts: SubagentToolCallPart[] = [
      {
        type: "tool-call",
        toolCallId: "dispatch-a",
        toolName: "mock_dispatch_subagent",
        args: { name: "Agent A", model: "mimo-v2.5-pro" },
        result: { name: "Agent A", model: "mimo-v2.5-pro", status: "running", progress: 20 },
        status: { type: "running" },
      },
      {
        type: "tool-call",
        toolCallId: "dispatch-b",
        toolName: "mock_dispatch_subagent",
        args: { name: "Agent B", model: "mimo-v2.5-pro" },
        result: { name: "Agent B", model: "mimo-v2.5-pro", status: "completed", progress: 100 },
        status: { type: "complete" },
      },
      {
        type: "tool-call",
        toolCallId: "dispatch-c",
        toolName: "mock_dispatch_subagent",
        args: { name: "Agent C", model: "mimo-v2.5-pro" },
        result: { name: "Agent C", model: "mimo-v2.5-pro", status: "running", progress: 55 },
        status: { type: "running" },
      },
    ];

    expect(projectSubagentToolCalls(parts)).toEqual({
      view: {
        agents: [
          { name: "Agent A", model: "mimo-v2.5-pro" },
          { name: "Agent B", model: "mimo-v2.5-pro" },
          { name: "Agent C", model: "mimo-v2.5-pro" },
        ],
        progress: [20, 100, 55],
        completedCount: 0,
        showSummary: false,
        summaryAgent: { name: "", model: "" },
      },
      eligibleToolCallIds: ["dispatch-a", "dispatch-b", "dispatch-c"],
    });
  });

  it("uses the shared dispatch eligibility projection and official fallback", async () => {
    const validProps = createProps({
      name: "Agent A",
      model: "mimo-v2.5-pro",
      status: "completed",
      progress: 100,
    }, {
      toolName: "mock_dispatch_subagent",
    });
    expect(isEligibleSubagentToolCall(validProps)).toBe(true);
    const validContainer = await renderTool(
      <MockDispatchSubagentToolUI {...validProps} />,
    );
    expect(validContainer.innerHTML).toBe("");

    const invalidFixtures = [
      createProps({ name: "Missing model", status: "completed" }, {
        toolName: "mock_dispatch_subagent",
      }),
      createProps({
        name: "Agent A",
        model: "mimo-v2.5-pro",
        status: "completed",
      }, {
        toolName: "mock_dispatch_subagent",
        isError: true,
      }),
      createProps({
        name: "Agent A",
        model: "mimo-v2.5-pro",
        status: "running",
      }, {
        toolName: "mock_dispatch_subagent",
        status: { type: "requires-action", reason: "tool-calls" },
      }),
      createProps({
        name: "Agent A",
        model: "mimo-v2.5-pro",
        status: "running",
      }, {
        toolName: "mock_dispatch_subagent",
        status: { type: "incomplete", reason: "error" },
      }),
    ];

    for (const props of invalidFixtures) {
      expect(isEligibleSubagentToolCall(props)).toBe(false);
      const container = await renderTool(
        <MockDispatchSubagentToolUI {...props} />,
      );
      expect(container.querySelector('[data-slot="tool-fallback-root"]'))
        .not.toBeNull();
    }
  });

  it("falls back to ToolFallback for malformed plan data", async () => {
    const container = await renderTool(
      <MockAgentPlanToolUI {...createProps({
        steps: ["Inspect"],
        activeIndex: "not-a-number",
      })} />,
    );

    expect(container.querySelector('[data-slot="agent-plan"]')).toBeNull();
    expect(container.querySelector('[data-slot="tool-fallback-root"]'))
      .not.toBeNull();
  });

  it("falls back to ToolFallback for malformed status data", async () => {
    const container = await renderTool(
      <MockAgentStatusToolUI {...createProps({
        state: "working",
        label: "Analyzing workspace",
        elapsed: 12,
      })} />,
    );

    expect(container.querySelector('[data-slot="agent-status"]')).toBeNull();
    expect(container.querySelector('[data-slot="tool-fallback-root"]'))
      .not.toBeNull();
  });

  it.each([
    { status: { type: "requires-action", reason: "tool-calls" } },
    { status: { type: "incomplete", reason: "error" } },
    { isError: true },
  ] as const)("keeps status and errors on ToolFallback", async (overrides) => {
    const container = await renderTool(
      <MockAgentStatusToolUI {...createProps({
        state: "working",
        label: "Analyzing workspace",
        elapsed: "0:12",
      }, overrides)} />,
    );

    expect(container.querySelector('[data-slot="agent-status"]')).toBeNull();
    expect(container.querySelector('[data-slot="tool-fallback-root"]'))
      .not.toBeNull();
  });
});
