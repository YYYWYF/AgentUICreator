// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import { AgentThreadWelcome } from "../agent-ui/components/thread-welcome";

const mountedRoots: Root[] = [];

async function renderWelcome(
  props: Partial<Parameters<typeof AgentThreadWelcome>[0]> = {},
) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  mountedRoots.push(root);
  await act(async () => {
    root.render(
      <AgentThreadWelcome title="Agent Frontend" {...props} />,
    );
  });
  return { container };
}

afterEach(async () => {
  await act(async () => {
    for (const root of mountedRoots.splice(0)) root.unmount();
  });
  document.body.replaceChildren();
});

describe("AgentThreadWelcome", () => {
  it("renders the title and a stable root anatomy", async () => {
    const { container } = await renderWelcome();
    const root = container.querySelector('[data-slot="agent-thread-welcome"]');
    expect(root).toBeInstanceOf(HTMLElement);
    expect(
      root?.querySelector('[data-slot="agent-thread-welcome-title"]')
        ?.textContent,
    ).toBe("Agent Frontend");
  });

  it("keeps optional regions absent by default", async () => {
    const { container } = await renderWelcome();
    expect(
      container.querySelector('[data-slot="agent-thread-welcome-description"]'),
    ).toBeNull();
    expect(
      container.querySelector('[data-slot="agent-thread-welcome-eyebrow"]'),
    ).toBeNull();
    expect(
      container.querySelector('[data-slot="agent-thread-welcome-icon"]'),
    ).toBeNull();
    expect(
      container.querySelector('[data-slot="agent-thread-welcome-meta"]'),
    ).toBeNull();
  });

  it("renders description, eyebrow, icon, and meta when provided", async () => {
    const { container } = await renderWelcome({
      description: "通过 AG-UI 与 Agent Runtime 连接。",
      eyebrow: "New task",
      icon: <span data-testid="welcome-glyph">◇</span>,
      meta: "最后同步 · 刚刚",
    });
    expect(
      container.querySelector('[data-slot="agent-thread-welcome-description"]')
        ?.textContent,
    ).toBe("通过 AG-UI 与 Agent Runtime 连接。");
    expect(
      container.querySelector('[data-slot="agent-thread-welcome-eyebrow"]')
        ?.textContent,
    ).toBe("New task");
    expect(
      container.querySelector('[data-slot="agent-thread-welcome-meta"]')
        ?.textContent,
    ).toBe("最后同步 · 刚刚");
    const icon = container.querySelector(
      '[data-slot="agent-thread-welcome-icon"]',
    );
    expect(icon).toBeInstanceOf(HTMLElement);
    expect(icon?.getAttribute("aria-hidden")).toBe("true");
    expect(icon?.querySelector('[data-testid="welcome-glyph"]')).not.toBeNull();
  });

  it("supports caller-owned headings, class names, and aria labels", async () => {
    const { container } = await renderWelcome({
      title: <span data-testid="rich-title">Rich</span>,
      ariaLabel: "智能体欢迎区",
      className: "caller-welcome",
    });
    const root = container.querySelector(
      '[data-slot="agent-thread-welcome"]',
    ) as HTMLElement;
    expect(root.getAttribute("aria-label")).toBe("智能体欢迎区");
    expect(root.classList.contains("caller-welcome")).toBe(true);
    expect(container.querySelector('[data-testid="rich-title"]')).not.toBeNull();
  });

  it("stays a pure presentation surface without runtime state", async () => {
    const { container } = await renderWelcome({
      description: "描述",
      eyebrow: "eyebrow",
    });
    const html = container.innerHTML;
    expect(html).not.toMatch(/data-agent-run-status|data-plugin-state|aria-busy/u);
    expect(container.querySelector("button")).toBeNull();
  });
});
