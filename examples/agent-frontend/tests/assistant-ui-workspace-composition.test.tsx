// @vitest-environment jsdom

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { AssistantUiWorkspaceShell } from "../agent-ui/adapters/assistant-ui/workspace";
import type { UIPluginComponentProps } from "../framework/contracts/ui-plugin";

vi.mock("../agent-ui/theme/useAgentUITheme", () => ({
  useAgentUIThemeMode: () => "dark",
}));

describe("assistant-ui workspace composition", () => {
  it("renders official Sidebar primitives around the two semantic child Slots", () => {
    const renderCalls: Array<{
      slotId: string;
      sizing: string | undefined;
    }> = [];
    const renderSlot: UIPluginComponentProps["renderSlot"] = (
      slotId,
      _fallback,
      options,
    ) => {
      renderCalls.push({ slotId, sizing: options?.sizing });
      return (
        <div
          data-fixture-slot={slotId}
          data-fixture-sizing={options?.sizing ?? "content"}
        />
      );
    };

    const html = renderToStaticMarkup(
      <AssistantUiWorkspaceShell renderSlot={renderSlot} />,
    );
    const documentRoot = document.implementation
      .createHTMLDocument("workspace composition");
    documentRoot.body.innerHTML = html;

    const workspace = documentRoot.querySelector(
      '[data-agent-ui-composition="workspace"]',
    );
    const sidebarProvider = documentRoot.querySelector(
      '[data-slot="sidebar-wrapper"]',
    );
    const sidebar = workspace?.querySelector('[data-slot="sidebar"]');
    const sidebarContent = sidebar?.querySelector(
      '[data-slot="sidebar-content"]',
    );
    const conversation = workspace?.querySelector(
      '[data-slot="sidebar-inset"]',
    );

    expect(workspace).not.toBeNull();
    expect(sidebarProvider).not.toBeNull();
    expect(sidebarProvider?.className).toContain("agent-ui-assistant-ui");
    expect(sidebarProvider?.className).toContain("dark");
    expect(sidebarProvider?.getAttribute("data-theme")).toBe("dark");
    expect(sidebar).not.toBeNull();
    expect(sidebarContent).not.toBeNull();
    expect(conversation).not.toBeNull();
    expect(
      sidebarContent?.querySelector(
        '[data-fixture-slot="agent-conversations"][data-fixture-sizing="fill"]',
      ),
    ).not.toBeNull();
    expect(
      conversation?.querySelector(
        '[data-fixture-slot="workspace.conversation"][data-fixture-sizing="fill"]',
      ),
    ).not.toBeNull();
    expect(sidebarContent?.className).toContain("px-2");
    expect(
      sidebarContent?.querySelector("[data-fixture-slot]")?.className,
    ).not.toContain("px-2");
    expect(sidebar?.querySelector('[data-slot="sidebar-header"]')).toBeNull();
    expect(sidebar?.querySelector('[data-slot="sidebar-footer"]')).toBeNull();
    expect(renderCalls).toEqual([
      { slotId: "agent-conversations", sizing: "fill" },
      { slotId: "workspace.conversation", sizing: "fill" },
    ]);
  });
});
