// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import {
  AgentToolDetail,
  type AgentToolDetailProps,
  type AgentToolDetailStatus,
} from "../agent-ui/components/tool-detail";
import { AgentUIRoot } from "../agent-ui/foundation/AgentUIRoot";

const mountedRoots: Root[] = [];

async function renderToolDetail(props: AgentToolDetailProps) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  mountedRoots.push(root);
  await act(async () => {
    root.render(
      <AgentUIRoot>
        <AgentToolDetail {...props} />
      </AgentUIRoot>,
    );
  });
  const detail = container.querySelector(
    '[data-slot="agent-tool-detail"]',
  ) as HTMLElement;
  return { container, detail };
}

afterEach(async () => {
  await act(async () => {
    for (const root of mountedRoots.splice(0)) root.unmount();
  });
  document.body.replaceChildren();
});

describe("AgentToolDetail", () => {
  it("renders empty anatomy without selected-only regions", async () => {
    const { detail } = await renderToolDetail({
      state: "empty",
      title: "工具详情",
      meta: "0 个调用",
      selector: <button type="button">选择工具</button>,
      emptyState: <span>暂无工具调用</span>,
    });

    expect(detail.tagName).toBe("SECTION");
    expect(detail.dataset.state).toBe("empty");
    expect(detail.hasAttribute("data-status")).toBe(false);
    expect(detail.querySelector('[data-slot="agent-tool-detail-header"]')).not.toBeNull();
    expect(detail.querySelector('[data-slot="agent-tool-detail-title"]')?.textContent)
      .toBe("工具详情");
    expect(detail.querySelector('[data-slot="agent-tool-detail-meta"]')?.textContent)
      .toBe("0 个调用");
    expect(detail.querySelector('[data-slot="agent-tool-detail-selector"]')?.textContent)
      .toBe("选择工具");
    expect(detail.querySelector('[data-slot="agent-tool-detail-empty"]')?.textContent)
      .toBe("暂无工具调用");
    expect(detail.querySelector('[data-slot="agent-tool-detail-summary"]')).toBeNull();
    expect(detail.querySelector('[data-slot="agent-tool-detail-arguments"]')).toBeNull();
    expect(detail.querySelector('[data-slot="agent-tool-detail-result"]')).toBeNull();
  });

  it("renders the selected anatomy and caller-owned content unchanged", async () => {
    const { detail } = await renderToolDetail({
      state: "selected",
      title: <strong>自定义标题</strong>,
      meta: <span>自定义元信息</span>,
      selector: <button type="button">自定义选择器</button>,
      status: "completed",
      name: <code>custom_tool</code>,
      statusLabel: <span>自定义状态</span>,
      toolCallId: <span>Call ID · call_custom</span>,
      argumentsContent: <pre>自定义参数</pre>,
      resultContent: <article>自定义结果</article>,
    });

    expect(detail.dataset.state).toBe("selected");
    for (const slot of [
      "agent-tool-detail-summary",
      "agent-tool-detail-status-icon",
      "agent-tool-detail-name",
      "agent-tool-detail-status-label",
      "agent-tool-detail-call-id",
      "agent-tool-detail-arguments",
      "agent-tool-detail-result",
    ]) {
      expect(detail.querySelector(`[data-slot="${slot}"]`), slot).not.toBeNull();
    }
    expect(detail.querySelector('[data-slot="agent-tool-detail-title"]')?.textContent)
      .toBe("自定义标题");
    expect(detail.querySelector('[data-slot="agent-tool-detail-meta"]')?.textContent)
      .toBe("自定义元信息");
    expect(detail.querySelector('[data-slot="agent-tool-detail-selector"]')?.textContent)
      .toBe("自定义选择器");
    expect(detail.querySelector('[data-slot="agent-tool-detail-name"]')?.textContent)
      .toBe("custom_tool");
    expect(detail.querySelector('[data-slot="agent-tool-detail-status-label"]')?.textContent)
      .toBe("自定义状态");
    expect(detail.querySelector('[data-slot="agent-tool-detail-arguments"]')?.textContent)
      .toBe("自定义参数");
    expect(detail.querySelector('[data-slot="agent-tool-detail-result"]')?.textContent)
      .toBe("自定义结果");
  });

  it.each([
    "running",
    "completed",
    "error",
    "interrupted",
  ] satisfies AgentToolDetailStatus[])("exposes %s without deriving its label", async (status) => {
    const { detail } = await renderToolDetail({
      state: "selected",
      title: "工具详情",
      status,
      name: "inspect_project",
      statusLabel: `caller-${status}`,
    });

    expect(detail.dataset.status).toBe(status);
    expect(detail.querySelector('[data-slot="agent-tool-detail-status-label"]')?.textContent)
      .toBe(`caller-${status}`);
    expect(detail.getAttribute("aria-busy")).toBe(
      status === "running" ? "true" : null,
    );
    expect(detail.querySelectorAll('[data-slot="spinner"]')).toHaveLength(
      status === "running" ? 1 : 0,
    );
  });

  it("omits optional caller-owned regions rather than inventing content", async () => {
    const { detail } = await renderToolDetail({
      state: "selected",
      title: "工具详情",
      status: "completed",
      name: "inspect_project",
      statusLabel: "已完成",
    });

    expect(detail.querySelector('[data-slot="agent-tool-detail-meta"]')).toBeNull();
    expect(detail.querySelector('[data-slot="agent-tool-detail-selector"]')).toBeNull();
    expect(detail.querySelector('[data-slot="agent-tool-detail-call-id"]')).toBeNull();
    expect(detail.querySelector('[data-slot="agent-tool-detail-arguments"]')).toBeNull();
    expect(detail.querySelector('[data-slot="agent-tool-detail-result"]')).toBeNull();
  });

  it("merges a caller className and applies only a caller aria label", async () => {
    const labeled = await renderToolDetail({
      state: "empty",
      title: "工具详情",
      emptyState: "暂无工具调用",
      className: "host-detail",
      ariaLabel: "Tool detail inspector",
    });
    expect(labeled.detail.classList.contains("host-detail")).toBe(true);
    expect(labeled.detail.getAttribute("aria-label")).toBe("Tool detail inspector");

    const unlabeled = await renderToolDetail({
      state: "empty",
      title: "工具详情",
      emptyState: "暂无工具调用",
    });
    expect(unlabeled.detail.hasAttribute("aria-label")).toBe(false);
  });
});
