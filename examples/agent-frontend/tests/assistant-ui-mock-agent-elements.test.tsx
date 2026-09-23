// @vitest-environment jsdom

import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ToolCallMessagePartProps } from "@assistant-ui/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  MockAgentPlanToolUI,
  MockAgentStatusToolUI,
  MockApprovalToolUI,
  MockRunCiJobToolUI,
  createConversationToolkit,
} from "../agent-ui/conversation/toolkit";

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
    expect(production).not.toHaveProperty("delete_generated_artifacts");
    expect(production).not.toHaveProperty("run_ci_job");
    const mockAgentPlan = mock.mock_agent_plan;
    const mockAgentStatus = mock.mock_agent_status;
    const mockApproval = mock.delete_generated_artifacts;
    const mockRunCiJob = mock.run_ci_job;
    expect(mockAgentPlan).toBeDefined();
    expect(mockAgentStatus).toBeDefined();
    expect(mockApproval).toBeDefined();
    expect(mockRunCiJob).toBeDefined();
    if (
      mockAgentPlan === undefined ||
      mockAgentStatus === undefined ||
      mockApproval === undefined ||
      mockRunCiJob === undefined
    ) {
      throw new Error("Mock Agent Elements toolkit entries are missing.");
    }
    expect(mockAgentPlan.type).toBe("backend");
    expect(mockAgentStatus.type).toBe("backend");
    expect(mockApproval.type).toBe("backend");
    expect(mockApproval.display).toBe("standalone");
    expect(mockRunCiJob.type).toBe("backend");
    expect(mockRunCiJob.render).toBe(MockRunCiJobToolUI);
    expect(mockApproval.render).toBe(MockApprovalToolUI);
    expect("execute" in mockAgentPlan).toBe(false);
  });

  it("renders the official AgentPlan from the shared projection", async () => {
    const container = await renderTool(
      <MockAgentPlanToolUI {...createProps(
        { applied: true },
        {
          args: {
            steps: ["Inspect", "Compare", "Update"],
            activeIndex: 1,
          },
        },
      )} />,
    );

    expect(container.querySelector('[data-slot="agent-plan"]')).not.toBeNull();
    expect(container.textContent).toContain("Inspect");
    expect(container.textContent).toContain("1 of 3");
  });

  it("renders official AgentStatus states from ToolCall status and args", async () => {
    const fixtures = [
      {
        state: "working",
        status: { type: "running" },
        args: { label: "Analyzing workspace", elapsed: "0:12" },
      },
      {
        state: "waiting",
        status: { type: "requires-action" },
        args: { label: "Waiting for approval", elapsed: "0:13" },
      },
      {
        state: "done",
        status: { type: "complete" },
        args: { label: "Analysis complete", elapsed: "0:24" },
      },
    ] as const;

    for (const fixture of fixtures) {
      const container = await renderTool(
        <MockAgentStatusToolUI {...createProps(
          { applied: true },
          { args: fixture.args, status: fixture.status },
        )} />,
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

  it("keeps consecutive AgentStatus frames on the Conversation parent gap", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    mountedRoots.push(root);

    await act(async () => {
      root.render(
        <div
          data-slot="aui_assistant-message-parts"
          style={{
            display: "flex",
            flexDirection: "column",
            rowGap: "16px",
          }}
        >
          <MockAgentStatusToolUI
            {...createProps(
              { applied: true },
              {
                args: { label: "First status", elapsed: "0:01" },
                status: { type: "running" },
                toolCallId: "status-1",
              },
            )}
          />
          <MockAgentStatusToolUI
            {...createProps(
              { applied: true },
              {
                args: { label: "Second status", elapsed: "0:02" },
                status: { type: "requires-action" },
                toolCallId: "status-2",
              },
            )}
          />
        </div>,
      );
    });

    const parts = container.querySelector<HTMLElement>(
      '[data-slot="aui_assistant-message-parts"]',
    );
    const frames = [
      ...container.querySelectorAll<HTMLElement>(
        '[data-agent-ui-composition-part="status"]',
      ),
    ];

    expect(parts).not.toBeNull();
    expect(frames).toHaveLength(2);
    if (parts === null || frames.length !== 2) {
      throw new Error("Consecutive AgentStatus frames are missing.");
    }

    // Keep this contract at the frame boundary; AgentStatus internals own
    // their own dimensions and are deliberately not measured here.
    const pixels = (value: string) => Number.parseFloat(value || "0");
    const firstFrameStyle = getComputedStyle(frames[0]);
    const secondFrameStyle = getComputedStyle(frames[1]);
    const externalSpacing =
      pixels(getComputedStyle(parts).rowGap) +
      pixels(firstFrameStyle.marginBottom) +
      pixels(secondFrameStyle.marginTop);

    expect(externalSpacing).toBeCloseTo(16, 0);
    expect(frames[0].classList.contains("my-3")).toBe(false);
    expect(frames[1].classList.contains("my-3")).toBe(false);
  });

  it("falls back to ToolFallback for malformed plan data", async () => {
    const container = await renderTool(
      <MockAgentPlanToolUI {...createProps(
        { applied: true },
        { args: { steps: ["Inspect"], activeIndex: "not-a-number" } },
      )} />,
    );

    expect(container.querySelector('[data-slot="agent-plan"]')).toBeNull();
    expect(container.querySelector('[data-slot="tool-fallback-root"]'))
      .not.toBeNull();
  });

  it("falls back to ToolFallback for malformed status data", async () => {
    const container = await renderTool(
      <MockAgentStatusToolUI {...createProps(
        { applied: true },
        {
          args: { label: "Analyzing workspace", elapsed: 12 },
          status: { type: "running" },
        },
      )} />,
    );

    expect(container.querySelector('[data-slot="agent-status"]')).toBeNull();
    expect(container.querySelector('[data-slot="tool-fallback-root"]'))
      .not.toBeNull();
  });

  it.each([
    { status: { type: "incomplete", reason: "error" } },
    { isError: true },
  ] as const)("keeps status and errors on ToolFallback", async (overrides) => {
    const container = await renderTool(
      <MockAgentStatusToolUI {...createProps(
        { applied: true },
        {
          args: { label: "Analyzing workspace", elapsed: "0:12" },
          ...overrides,
        },
      )} />,
    );

    expect(container.querySelector('[data-slot="agent-status"]')).toBeNull();
    expect(container.querySelector('[data-slot="tool-fallback-root"]'))
      .not.toBeNull();
  });

  it("derives waiting from requires-action without reading result.state", async () => {
    const container = await renderTool(
      <MockAgentStatusToolUI {...createProps(
        { state: "done", label: "Wrong result state" },
        {
          args: { label: "Waiting for dependency", elapsed: "0:18" },
          status: { type: "requires-action", reason: "tool-calls" },
        },
      )} />,
    );

    expect(container.querySelector('[data-slot="agent-status"]')).not.toBeNull();
    expect(container.textContent).toContain("waiting");
    expect(container.textContent).toContain("Waiting for dependency");
    expect(container.textContent).not.toContain("Wrong result state");
  });
});
