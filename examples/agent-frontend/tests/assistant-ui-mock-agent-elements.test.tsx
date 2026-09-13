// @vitest-environment jsdom

import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ToolCallMessagePartProps } from "@assistant-ui/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  MockAgentPlanToolUI,
  MockAgentStatusToolUI,
  MockSubagentsToolUI,
  createAssistantUiToolkit,
} from "../agent-ui/adapters/assistant-ui/toolkit";

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
    const production = createAssistantUiToolkit();
    const mock = createAssistantUiToolkit({ mockAgentElements: true });

    expect(production).not.toHaveProperty("mock_agent_plan");
    expect(production).not.toHaveProperty("mock_agent_status");
    expect(production).not.toHaveProperty("mock_subagents");
    const mockAgentPlan = mock.mock_agent_plan;
    const mockAgentStatus = mock.mock_agent_status;
    const mockSubagents = mock.mock_subagents;
    expect(mockAgentPlan).toBeDefined();
    expect(mockAgentStatus).toBeDefined();
    expect(mockSubagents).toBeDefined();
    if (
      mockAgentPlan === undefined ||
      mockAgentStatus === undefined ||
      mockSubagents === undefined
    ) {
      throw new Error("Mock Agent Elements toolkit entries are missing.");
    }
    expect(mockAgentPlan.type).toBe("backend");
    expect(mockAgentStatus.type).toBe("backend");
    expect(mockSubagents.type).toBe("backend");
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

  it("renders SubagentList and preserves out-of-order progress", async () => {
    const container = await renderTool(
      <MockSubagentsToolUI {...createProps({
        agents: [
          { name: "Agent A", model: "mimo-v2.5-pro", status: "running", progress: 20 },
          { name: "Agent B", model: "mimo-v2.5-pro", status: "completed", progress: 100 },
          { name: "Agent C", model: "mimo-v2.5-pro", status: "running", progress: 55 },
        ],
        showSummary: false,
      })} />,
    );

    expect(container.querySelector('[data-slot="subagent-list"]')).not.toBeNull();
    expect(container.querySelectorAll('[role="progressbar"]')).toHaveLength(3);
    const completedProgress = container.querySelectorAll('[role="progressbar"]')[1];
    expect(completedProgress).toBeDefined();
    if (completedProgress === undefined) {
      throw new Error("Completed subagent progress bar is missing.");
    }
    expect(completedProgress.getAttribute("aria-valuenow")).toBe("100");
    expect(container.textContent).toContain("Agent B");
  });

  it("renders the official SubagentList summary from explicit values", async () => {
    const container = await renderTool(
      <MockSubagentsToolUI {...createProps({
        agents: [
          { name: "Agent A", model: "mimo-v2.5-pro", status: "completed" },
        ],
        showSummary: true,
        summaryAgent: { name: "Summary Agent", model: "mimo-v2.5-pro" },
      })} />,
    );

    expect(container.querySelector('[data-slot="subagent-list"]')).not.toBeNull();
    expect(container.textContent).toContain("Summary Agent");
    expect(container.textContent).toContain("mimo-v2.5-pro");
    expect(container.querySelector('[aria-label="Summary Agent progress"]'))
      .not.toBeNull();
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

  it("falls back to ToolFallback for malformed subagent data", async () => {
    const container = await renderTool(
      <MockSubagentsToolUI {...createProps({
        agents: [{
          name: "Agent A",
          model: "mimo-v2.5-pro",
          status: "blocked",
          progress: 100,
        }],
        showSummary: false,
      })} />,
    );

    expect(container.querySelector('[data-slot="subagent-list"]')).toBeNull();
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
