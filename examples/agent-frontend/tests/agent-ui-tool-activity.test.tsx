// @vitest-environment jsdom

import { act, type ReactNode, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  AgentToolActivity,
  type AgentToolActivityProps,
  type AgentToolActivityStatus,
} from "../agent-ui/components/tool-activity";
import { AgentUIRoot } from "../agent-ui/foundation/AgentUIRoot";

const mountedRoots: Root[] = [];

async function renderActivity(
  props: AgentToolActivityProps,
  children: ReactNode = <span data-testid="activity-child">child</span>,
) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  mountedRoots.push(root);
  await act(async () => {
    root.render(
      <AgentUIRoot>
        <AgentToolActivity {...props}>{children}</AgentToolActivity>
      </AgentUIRoot>,
    );
  });
  const activity = container.querySelector(
    '[data-slot="agent-tool-activity"]',
  ) as HTMLElement;
  return { activity, container };
}

afterEach(async () => {
  await act(async () => {
    for (const root of mountedRoots.splice(0)) root.unmount();
  });
  document.body.replaceChildren();
});

describe("AgentToolActivity", () => {
  it("renders flat anatomy without grouped disclosure UI", async () => {
    const { activity } = await renderActivity({
      presentation: "flat",
      status: "completed",
      children: null,
    });

    expect(activity.tagName).toBe("SECTION");
    expect(activity.dataset.presentation).toBe("flat");
    expect(activity.dataset.status).toBe("completed");
    expect(activity.querySelector('[data-slot="agent-tool-activity-items"]')).not.toBeNull();
    expect(activity.querySelector('[data-slot="agent-tool-activity-trigger"]')).toBeNull();
    expect(activity.querySelector('[data-slot="agent-tool-activity-summary"]')).toBeNull();
    expect(activity.querySelector('[data-slot="agent-tool-activity-chevron"]')).toBeNull();
  });

  it("renders the stable grouped anatomy", async () => {
    const { activity } = await renderActivity({
      presentation: "grouped",
      status: "completed",
      expanded: true,
      onExpandedChange: () => undefined,
      summary: "使用了 2 个工具",
      children: null,
    });

    for (const slot of [
      "agent-tool-activity-trigger",
      "agent-tool-activity-status-icon",
      "agent-tool-activity-summary",
      "agent-tool-activity-chevron",
      "agent-tool-activity-content",
      "agent-tool-activity-items",
    ]) {
      expect(activity.querySelector(`[data-slot="${slot}"]`), slot).not.toBeNull();
    }
  });

  it("lets the caller control disclosure in both directions", async () => {
    function Fixture() {
      const [expanded, setExpanded] = useState(true);
      return (
        <AgentToolActivity
          presentation="grouped"
          status="completed"
          expanded={expanded}
          onExpandedChange={setExpanded}
          summary="Summary"
        >
          child
        </AgentToolActivity>
      );
    }

    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    mountedRoots.push(root);
    await act(async () => root.render(<AgentUIRoot><Fixture /></AgentUIRoot>));

    const activity = container.querySelector('[data-slot="agent-tool-activity"]') as HTMLElement;
    const trigger = container.querySelector('[data-slot="agent-tool-activity-trigger"]') as HTMLButtonElement;
    expect(activity.dataset.expanded).toBe("true");
    await act(async () => trigger.click());
    expect(activity.dataset.expanded).toBe("false");
    await act(async () => trigger.click());
    expect(activity.dataset.expanded).toBe("true");
  });

  it("does not hide disclosure state inside the component", async () => {
    const onExpandedChange = vi.fn();
    const { activity } = await renderActivity({
      presentation: "grouped",
      status: "completed",
      expanded: true,
      onExpandedChange,
      summary: "Summary",
      children: null,
    });
    const trigger = activity.querySelector('[data-slot="agent-tool-activity-trigger"]') as HTMLButtonElement;

    await act(async () => trigger.click());

    expect(onExpandedChange).toHaveBeenCalledWith(false);
    expect(activity.dataset.expanded).toBe("true");
  });

  it.each([
    ["running", false],
    ["completed", true],
    ["error", false],
    ["interrupted", true],
  ] as const)("keeps %s independent from expanded=%s", async (status, expanded) => {
    const { activity } = await renderActivity({
      presentation: "grouped",
      status,
      expanded,
      onExpandedChange: () => undefined,
      summary: "Summary",
      children: null,
    });

    expect(activity.dataset.expanded).toBe(expanded ? "true" : "false");
  });

  it("shows one grouped spinner only while running", async () => {
    for (const status of [
      "running",
      "completed",
      "error",
      "interrupted",
    ] satisfies AgentToolActivityStatus[]) {
      const { activity } = await renderActivity({
        presentation: "grouped",
        status,
        expanded: true,
        onExpandedChange: () => undefined,
        summary: "Summary",
        children: null,
      });
      expect(activity.querySelectorAll('[data-slot="spinner"]')).toHaveLength(
        status === "running" ? 1 : 0,
      );
      expect(activity.getAttribute("aria-busy")).toBe(
        status === "running" ? "true" : null,
      );
    }
  });

  it("marks flat running as busy without an aggregate spinner", async () => {
    const { activity } = await renderActivity({
      presentation: "flat",
      status: "running",
      children: null,
    });

    expect(activity.getAttribute("aria-busy")).toBe("true");
    expect(activity.querySelector('[data-slot="spinner"]')).toBeNull();
  });

  it("keeps grouped children mounted while collapsed", async () => {
    const { activity } = await renderActivity(
      {
        presentation: "grouped",
        status: "completed",
        expanded: false,
        onExpandedChange: () => undefined,
        summary: "Summary",
        children: null,
      },
      <div data-testid="mounted-child" />,
    );

    expect(activity.querySelector('[data-testid="mounted-child"]')).not.toBeNull();
  });

  it("renders only the caller-owned summary", async () => {
    const { activity } = await renderActivity({
      presentation: "grouped",
      status: "error",
      expanded: true,
      onExpandedChange: () => undefined,
      summary: "自定义工具活动摘要",
      children: null,
    });
    const summary = activity.querySelector('[data-slot="agent-tool-activity-summary"]') as HTMLElement;

    expect(summary.textContent).toBe("自定义工具活动摘要");
    expect(summary.textContent).not.toMatch(/正在调用|使用了|失败/u);
  });

  it("accepts arbitrary children, className, and ariaLabel", async () => {
    const { activity } = await renderActivity(
      {
        presentation: "flat",
        status: "completed",
        className: "custom-activity",
        ariaLabel: "Tool activity",
        children: null,
      },
      <article data-testid="arbitrary-child">arbitrary</article>,
    );

    expect(activity.classList.contains("custom-activity")).toBe(true);
    expect(activity.getAttribute("aria-label")).toBe("Tool activity");
    expect(activity.querySelector('[data-testid="arbitrary-child"]')?.textContent).toBe("arbitrary");
  });
});
