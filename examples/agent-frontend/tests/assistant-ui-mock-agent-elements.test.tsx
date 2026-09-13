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

function createProps(result: unknown): MockToolProps {
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
    expect(mock.mock_agent_plan.type).toBe("backend");
    expect(mock.mock_agent_status.type).toBe("backend");
    expect(mock.mock_subagents.type).toBe("backend");
    expect((mock.mock_agent_plan as Record<string, unknown>).execute)
      .toBeUndefined();
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

  it("renders the official AgentStatus with explicit values", async () => {
    const container = await renderTool(
      <MockAgentStatusToolUI {...createProps({
        state: "working",
        label: "Analyzing workspace",
        elapsed: "0:12",
      })} />,
    );

    expect(container.querySelector('[data-slot="agent-status"]')).not.toBeNull();
    expect(container.textContent).toContain("Analyzing workspace");
    expect(container.textContent).toContain("0:12");
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
    expect(container.querySelectorAll('[role="progressbar"]')[1])
      .toHaveAttribute("aria-valuenow", "100");
    expect(container.textContent).toContain("Agent B");
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
});
