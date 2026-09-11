// @vitest-environment jsdom

import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";

import {
  AgentConversationGroup,
  AgentConversationItem,
  AgentConversationList,
  AgentConversationState,
} from "../agent-ui/components/conversation-list";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

function render(element: ReactElement): ReactTestRenderer {
  let renderer: ReactTestRenderer | undefined;
  act(() => {
    renderer = create(element);
  });
  if (renderer === undefined) throw new Error("Renderer was not created");
  return renderer;
}

describe("AgentConversationList", () => {
  it("renders header regions, groups, items, and state presentation", () => {
    const html = renderToStaticMarkup(
      <AgentConversationList
        action={<button type="button">新建</button>}
        ariaLabel="项目会话"
        meta="3"
        title="会话"
      >
        <AgentConversationGroup label="当前">
          <AgentConversationItem
            active
            leading="•"
            meta="Live"
            title="当前会话"
            trailing="›"
          />
        </AgentConversationGroup>
        <AgentConversationGroup label="历史会话">
          <AgentConversationState action={<button type="button">重试</button>} kind="error">
            加载会话失败
          </AgentConversationState>
        </AgentConversationGroup>
      </AgentConversationList>,
    );

    expect(html).toContain('aria-label="项目会话"');
    expect(html).toContain("会话");
    expect(html).toContain("当前");
    expect(html).toContain("历史会话");
    expect(html).toContain('data-active="true"');
    expect(html).toContain('aria-current="page"');
    expect(html).toContain('role="alert"');
    expect(html).toContain("Live");
  });

  it("uses native buttons and invokes selection once", () => {
    const onSelect = vi.fn();
    const renderer = render(
      <AgentConversationItem onSelect={onSelect} title="产品规划讨论" />,
    );
    const button = renderer.root.findByType("button");

    act(() => button.props.onClick());

    expect(button.props.type).toBe("button");
    expect(onSelect).toHaveBeenCalledOnce();
  });

  it("does not select disabled items", () => {
    const onSelect = vi.fn();
    const renderer = render(
      <AgentConversationItem disabled onSelect={onSelect} title="不可用会话" />,
    );
    const button = renderer.root.findByType("button");

    act(() => button.props.onClick());

    expect(button.props.disabled).toBe(true);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("supports long titles and omitted optional regions", () => {
    const longTitle = "为下一阶段 Agent Frontend Plugin Creator 制定完整而明确的交付计划";
    const html = renderToStaticMarkup(
      <AgentConversationList ariaLabel="会话" className="custom-list">
        <AgentConversationGroup className="custom-group">
          <AgentConversationItem className="custom-item" title={longTitle} />
        </AgentConversationGroup>
        <AgentConversationState kind="loading">加载中</AgentConversationState>
        <AgentConversationState kind="empty">暂无历史会话</AgentConversationState>
      </AgentConversationList>,
    );

    expect(html).toContain(longTitle);
    expect(html).toContain("custom-list");
    expect(html).toContain("custom-group");
    expect(html).toContain("custom-item");
    expect(html).not.toContain("agent-conversation-list-header");
    expect(html).toContain('data-kind="loading"');
    expect(html).toContain('data-kind="empty"');
  });
});
