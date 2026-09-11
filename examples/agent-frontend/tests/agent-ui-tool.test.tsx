// @vitest-environment jsdom

import { act, type ReactNode, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  AgentTool,
  type AgentToolProps,
} from "../agent-ui/components/tool";
import { AgentUIRoot } from "../agent-ui/foundation/AgentUIRoot";

const mountedRoots: Root[] = [];

const anatomySlots = [
  "agent-tool-trigger",
  "agent-tool-status-icon",
  "agent-tool-identity",
  "agent-tool-name",
  "agent-tool-status",
  "agent-tool-status-label",
  "agent-tool-chevron",
  "agent-tool-content",
  "agent-tool-body",
] as const;

async function renderTool(
  props: Partial<AgentToolProps> = {},
  children: ReactNode = "Output",
) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  mountedRoots.push(root);
  await act(async () => {
    root.render(
      <AgentUIRoot>
        <AgentTool
          status="completed"
          expanded
          onExpandedChange={() => undefined}
          name="inspect_project"
          statusLabel="已完成"
          {...props}
        >
          {children}
        </AgentTool>
      </AgentUIRoot>,
    );
  });
  const tool = container.querySelector('[data-slot="agent-tool"]') as HTMLElement;
  const trigger = tool.querySelector(
    '[data-slot="agent-tool-trigger"]',
  ) as HTMLButtonElement;
  return { container, tool, trigger };
}

afterEach(async () => {
  await act(async () => {
    for (const root of mountedRoots.splice(0)) root.unmount();
  });
  document.body.replaceChildren();
});

describe("AgentTool", () => {
  it("renders the stable operation anatomy", async () => {
    const { tool } = await renderTool({ summary: "工具调用 · 已返回结果" });

    expect(tool.tagName).toBe("SECTION");
    for (const slot of anatomySlots) {
      expect(tool.querySelector(`[data-slot="${slot}"]`), slot).not.toBeNull();
    }
    expect(tool.querySelector('[data-slot="agent-tool-summary"]')).not.toBeNull();
  });

  it("lets the caller control expanded state in both directions", async () => {
    function Fixture() {
      const [expanded, setExpanded] = useState(true);
      return (
        <AgentTool
          status="completed"
          expanded={expanded}
          onExpandedChange={setExpanded}
          name="inspect_project"
          summary="工具调用 · 已返回结果"
          statusLabel="已完成"
        >
          Result
        </AgentTool>
      );
    }

    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    mountedRoots.push(root);
    await act(async () => root.render(<AgentUIRoot><Fixture /></AgentUIRoot>));

    const tool = container.querySelector('[data-slot="agent-tool"]') as HTMLElement;
    const trigger = tool.querySelector('[data-slot="agent-tool-trigger"]') as HTMLButtonElement;
    expect(tool.dataset.expanded).toBe("true");
    expect(trigger.getAttribute("aria-expanded")).toBe("true");

    await act(async () => trigger.click());
    expect(tool.dataset.expanded).toBe("false");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");

    await act(async () => trigger.click());
    expect(tool.dataset.expanded).toBe("true");
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
  });

  it("does not keep hidden expansion state", async () => {
    const onExpandedChange = vi.fn();
    const { tool, trigger } = await renderTool({ onExpandedChange });

    await act(async () => trigger.click());

    expect(onExpandedChange).toHaveBeenCalledWith(false);
    expect(tool.dataset.expanded).toBe("true");
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
  });

  it("shows a silent Spinner and busy state only while running", async () => {
    const { tool } = await renderTool({ status: "running" });
    expect(tool.dataset.status).toBe("running");
    expect(tool.getAttribute("aria-busy")).toBe("true");
    const spinner = tool.querySelectorAll('[data-slot="spinner"]');
    expect(spinner).toHaveLength(1);
    expect(spinner[0]?.getAttribute("aria-hidden")).toBe("true");
    expect(spinner[0]?.hasAttribute("aria-label")).toBe(false);
  });

  it("keeps a static status icon and no busy state after running", async () => {
    const { tool } = await renderTool({ status: "completed" });
    expect(tool.dataset.status).toBe("completed");
    expect(tool.hasAttribute("aria-busy")).toBe(false);
    expect(tool.querySelectorAll('[data-slot="spinner"]')).toHaveLength(0);
    expect(tool.querySelector('[data-slot="agent-tool-status-icon"]')).not.toBeNull();
  });

  it("exposes error status through the caller-owned label only", async () => {
    const { tool } = await renderTool({ status: "error", statusLabel: "失败" });
    expect(tool.dataset.status).toBe("error");
    expect(tool.querySelectorAll('[data-slot="spinner"]')).toHaveLength(0);
    expect(
      tool.querySelector('[data-slot="agent-tool-status-label"]')?.textContent,
    ).toBe("失败");
    expect(tool.textContent).not.toMatch(/Error|Failed/u);
  });

  it("keeps interrupted states caller-owned and free of error wording", async () => {
    const { tool } = await renderTool({
      status: "interrupted",
      statusLabel: "未完成",
    });
    expect(tool.dataset.status).toBe("interrupted");
    expect(tool.querySelectorAll('[data-slot="spinner"]')).toHaveLength(0);
    expect(
      tool.querySelector('[data-slot="agent-tool-status-label"]')?.textContent,
    ).toBe("未完成");
    expect(tool.textContent).not.toMatch(/Error|Failed/u);
  });

  it.each([
    ["running", false],
    ["completed", true],
    ["error", false],
    ["interrupted", true],
  ] as const)(
    "keeps status %s independent from expanded=%s",
    async (status, expanded) => {
      const { tool, trigger } = await renderTool({ status, expanded });
      expect(tool.dataset.expanded).toBe(String(expanded));
      expect(trigger.getAttribute("aria-expanded")).toBe(String(expanded));
    },
  );

  it("renders arbitrary caller content", async () => {
    const { tool } = await renderTool(
      {},
      <div data-testid="tool-details">custom</div>,
    );
    expect(tool.querySelector('[data-testid="tool-details"]')?.textContent)
      .toBe("custom");
  });

  it("never appends built-in names, summaries, or status labels", async () => {
    const { tool } = await renderTool({
      name: "自定义工具",
      summary: "自定义摘要",
      statusLabel: "自定义状态",
    });

    expect(tool.querySelector('[data-slot="agent-tool-name"]')?.textContent)
      .toBe("自定义工具");
    expect(tool.querySelector('[data-slot="agent-tool-summary"]')?.textContent)
      .toBe("自定义摘要");
    expect(tool.querySelector('[data-slot="agent-tool-status-label"]')?.textContent)
      .toBe("自定义状态");
    expect(tool.textContent).not.toMatch(/工具调用|执行中|已完成|失败|未完成/u);
  });

  it("omits the summary slot when no summary is provided", async () => {
    const { tool } = await renderTool();
    expect(tool.querySelector('[data-slot="agent-tool-summary"]')).toBeNull();
    expect(tool.querySelector('[data-slot="agent-tool-name"]')).not.toBeNull();
    expect(tool.querySelector('[data-slot="agent-tool-body"]')).not.toBeNull();
  });

  it("merges a caller className with the owned classes", async () => {
    const { tool } = await renderTool({ className: "host-tool" });
    expect(tool.classList.contains("host-tool")).toBe(true);
    expect(tool.classList.length).toBeGreaterThan(1);
  });

  it("only applies a caller-provided aria label", async () => {
    const labeled = await renderTool({ ariaLabel: "Tool inspect_project" });
    expect(labeled.tool.getAttribute("aria-label")).toBe("Tool inspect_project");

    const unlabeled = await renderTool();
    expect(unlabeled.tool.hasAttribute("aria-label")).toBe(false);
    expect(unlabeled.trigger.getAttribute("aria-label")).toBeNull();
  });
});
