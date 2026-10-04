// @vitest-environment jsdom

import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ToolCallMessagePartProps } from "@assistant-ui/react";
import { afterEach, describe, expect, it } from "vitest";

import { MockAgentStatusToolUI } from "../../../source-registry/registry/items/plugin-agent-status-message/files/plugins/agent-status-message/index";
import { MockRunCiJobToolUI } from "../../../source-registry/registry/items/plugin-job-progress-message/files/plugins/job-progress-message/index";
import agentStatusMessagePlugin from "../../../source-registry/registry/items/plugin-agent-status-message/files/plugins/agent-status-message/definition";
import jobProgressMessagePlugin from "../../../source-registry/registry/items/plugin-job-progress-message/files/plugins/job-progress-message/definition";
import { createConversationToolkit } from "../../../source-registry/registry/items/foundation-core-adapters/files/agent-ui/conversation/toolkit/index";
import { AgentRuntimeProvider } from "../../../source-registry/registry/items/foundation-core-runtime/files/runtime/context/AgentRuntimeProvider";

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

function runtimeWithState(state: unknown) {
  const snapshot = {
    conversation: { id: "test", status: "live" },
    messages: [],
    state,
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
  } as never;
}

async function renderRunCiJob(
  result: unknown,
  state: unknown,
  overrides: Partial<MockToolProps> = {},
) {
  return renderTool(
    <AgentRuntimeProvider runtime={runtimeWithState(state)}>
      <MockRunCiJobToolUI {...createProps(result, {
        toolCallId: "ci-job-1",
        toolName: "run_ci_job",
        args: {
          target: "Verify the current change on CI",
          stages: [
            { name: "build", weight: 1, description: "Compile the app." },
            { name: "test", weight: 1 },
          ],
        },
        ...overrides,
      })} />
    </AgentRuntimeProvider>,
  );
}

afterEach(async () => {
  await act(async () => {
    for (const root of mountedRoots.splice(0)) root.unmount();
  });
  document.body.replaceChildren();
});

describe("Mock Agent official element renderers", () => {
  it("declares Mock backend renderers on their owning Plugins", () => {
    const production = createConversationToolkit();
    for (const name of ["mock_agent_plan", "mock_agent_status", "delete_generated_artifacts", "run_ci_job"]) {
      expect(production).not.toHaveProperty(name);
    }
    expect(agentStatusMessagePlugin.toolkit?.mock_agent_status).toMatchObject({ type: "backend", render: MockAgentStatusToolUI });
    expect(jobProgressMessagePlugin.toolkit?.run_ci_job).toMatchObject({ type: "backend", render: MockRunCiJobToolUI });
  });

  it("registers AgentPlan as Activity Data Message UI, not a named Tool", async () => {
    const { default: agentPlanMessagePlugin } = await import("../../../source-registry/registry/items/plugin-agent-plan-message/files/plugins/agent-plan-message/definition");
    expect(agentPlanMessagePlugin.toolkit).toBeUndefined();
    expect(agentPlanMessagePlugin.dataMessageUIs?.map(({ name }) => name))
      .toEqual(["agui-activity/agent-plan"]);
    expect(agentPlanMessagePlugin.manifest.data?.messageUI).toBe(true);
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
        status: { type: "requires-action", reason: "tool-calls" },
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
      expect(container.textContent).toContain(fixture.args.label);
      if (fixture.state !== "done") {
        expect(container.textContent).toContain(fixture.args.elapsed);
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
                status: { type: "requires-action", reason: "tool-calls" },
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
    const firstFrame = frames[0];
    const secondFrame = frames[1];
    if (parts === null || firstFrame === undefined || secondFrame === undefined) {
      throw new Error("Consecutive AgentStatus frames are missing.");
    }

    // Keep this contract at the frame boundary; AgentStatus internals own
    // their own dimensions and are deliberately not measured here.
    const pixels = (value: string) => Number.parseFloat(value || "0");
    const firstFrameStyle = getComputedStyle(firstFrame);
    const secondFrameStyle = getComputedStyle(secondFrame);
    const externalSpacing =
      pixels(getComputedStyle(parts).rowGap) +
      pixels(firstFrameStyle.marginBottom) +
      pixels(secondFrameStyle.marginTop);

    expect(externalSpacing).toBeCloseTo(16, 0);
    expect(firstFrame.classList.contains("my-3")).toBe(false);
    expect(secondFrame.classList.contains("my-3")).toBe(false);
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

  it("renders a running CI job from STATE and stage descriptions", async () => {
    const container = await renderRunCiJob(undefined, {
      jobs: { "ci-job-1": { stageIndex: 0, stageProgress: 0.4, eta: "about 2 min" } },
    }, { status: { type: "running" } });
    expect(container.querySelector('[data-slot="job-progress"]')?.getAttribute("data-state"))
      .toBe("running");
    expect(container.textContent).toContain("Compile the app.");
    expect(container.textContent).toContain("about 2 min");
  });

  it.each([
    [{ success: true, summary: "All stages passed" }, "success"],
    [{ success: false, summary: "Build failed" }, "failed"],
    [{ status: "partial", summary: "Two checks skipped" }, "partial"],
    [{ status: "cancelled", summary: "Stopped by request" }, "cancelled"],
  ] as const)("renders an explicit %s Tool Result outcome", async (result, expected) => {
    const container = await renderRunCiJob(result, {
      jobs: { "ci-job-1": { stageIndex: 2, stageProgress: 0, eta: "" } },
    }, { status: { type: "complete" } });
    expect(container.querySelector('[data-slot="job-progress"]')?.getAttribute("data-state"))
      .toBe(expected);
    expect(container.textContent).toContain(result.summary ?? "");
  });

  it("does not infer success when STATE reaches the end without a Tool Result", async () => {
    const container = await renderRunCiJob(undefined, {
      jobs: { "ci-job-1": { stageIndex: 2, stageProgress: 0, eta: "" } },
    }, { status: { type: "running" } });
    expect(container.querySelector('[data-slot="job-progress"]')).toBeNull();
    expect(container.querySelector('[data-slot="tool-fallback-root"]')).not.toBeNull();
  });

  it("uses canonical Tool cancellation lifecycle when no explicit result exists", async () => {
    const container = await renderRunCiJob(undefined, {
      jobs: { "ci-job-1": { stageIndex: 1, stageProgress: 0.5, eta: "" } },
    }, { status: { type: "incomplete", reason: "cancelled" } });
    expect(container.querySelector('[data-slot="job-progress"]')?.getAttribute("data-state"))
      .toBe("cancelled");
  });
});
