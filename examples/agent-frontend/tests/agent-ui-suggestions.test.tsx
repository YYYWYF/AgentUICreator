// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  AgentSuggestion,
  AgentSuggestions,
} from "../agent-ui/components/suggestions";

const mountedRoots: Root[] = [];

async function renderSuggestions(node: React.ReactNode) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  mountedRoots.push(root);
  await act(async () => {
    root.render(node);
  });
  return { container };
}

function suggestion(
  container: HTMLElement,
  index = 0,
): HTMLButtonElement {
  return container.querySelectorAll(
    '[data-slot="agent-suggestion"]',
  )[index] as HTMLButtonElement;
}

afterEach(async () => {
  await act(async () => {
    for (const root of mountedRoots.splice(0)) root.unmount();
  });
  document.body.replaceChildren();
});

describe("AgentSuggestions", () => {
  it("renders group title, list, and children in order", async () => {
    const { container } = await renderSuggestions(
      <AgentSuggestions title="你可以这样开始">
        <AgentSuggestion title="总结当前上下文" />
        <AgentSuggestion title="解释当前界面结构" />
      </AgentSuggestions>,
    );
    expect(
      container.querySelector('[data-slot="agent-suggestions-title"]')
        ?.textContent,
    ).toBe("你可以这样开始");
    const list = container.querySelector('[data-slot="agent-suggestions-list"]');
    expect(list).toBeInstanceOf(HTMLElement);
    expect(list?.children).toHaveLength(2);
    expect(suggestion(container, 0).textContent).toContain("总结当前上下文");
    expect(suggestion(container, 1).textContent).toContain("解释当前界面结构");
  });

  it("omits the group title when the caller does not provide one", async () => {
    const { container } = await renderSuggestions(
      <AgentSuggestions>
        <AgentSuggestion title="总结当前上下文" />
      </AgentSuggestions>,
    );
    expect(
      container.querySelector('[data-slot="agent-suggestions-title"]'),
    ).toBeNull();
  });
});

describe("AgentSuggestion", () => {
  it("uses semantic button anatomy with title, description, and icon", async () => {
    const { container } = await renderSuggestions(
      <AgentSuggestion
        description="提炼目标、约束与下一步"
        icon={<span data-testid="suggestion-glyph">◇</span>}
        title="总结当前上下文"
      />,
    );
    const item = suggestion(container);
    expect(item).toBeInstanceOf(HTMLButtonElement);
    expect(item.getAttribute("type")).toBe("button");
    expect(
      item.querySelector('[data-slot="agent-suggestion-title"]')?.textContent,
    ).toBe("总结当前上下文");
    expect(
      item.querySelector('[data-slot="agent-suggestion-description"]')
        ?.textContent,
    ).toBe("提炼目标、约束与下一步");
    const icon = item.querySelector('[data-slot="agent-suggestion-icon"]');
    expect(icon?.getAttribute("aria-hidden")).toBe("true");
    expect(item.querySelector('[data-testid="suggestion-glyph"]')).not.toBeNull();
  });

  it("omits optional regions by default", async () => {
    const { container } = await renderSuggestions(
      <AgentSuggestion title="建议下一步" />,
    );
    const item = suggestion(container);
    expect(
      item.querySelector('[data-slot="agent-suggestion-description"]'),
    ).toBeNull();
    expect(
      item.querySelector('[data-slot="agent-suggestion-icon"]'),
    ).toBeNull();
  });

  it("reports selection through onSelect", async () => {
    const onSelect = vi.fn();
    const { container } = await renderSuggestions(
      <AgentSuggestion onSelect={onSelect} title="总结当前上下文" />,
    );
    await act(async () => {
      suggestion(container).click();
    });
    expect(onSelect).toHaveBeenCalledOnce();
  });

  it("blocks selection and the disabled attribute when disabled", async () => {
    const onSelect = vi.fn();
    const { container } = await renderSuggestions(
      <AgentSuggestion disabled onSelect={onSelect} title="总结当前上下文" />,
    );
    const item = suggestion(container);
    expect(item.disabled).toBe(true);
    await act(async () => {
      item.click();
    });
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("keeps caller-owned class names on both components", async () => {
    const { container } = await renderSuggestions(
      <AgentSuggestions className="caller-group" title="Group">
        <AgentSuggestion className="caller-item" title="Item" />
      </AgentSuggestions>,
    );
    expect(
      container
        .querySelector('[data-slot="agent-suggestions"]')
        ?.classList.contains("caller-group"),
    ).toBe(true);
    expect(
      suggestion(container).classList.contains("caller-item"),
    ).toBe(true);
  });

  it("stays a pure presentation surface without runtime state", async () => {
    const { container } = await renderSuggestions(
      <AgentSuggestions title="Group">
        <AgentSuggestion description="描述" title="Item" />
      </AgentSuggestions>,
    );
    expect(container.innerHTML).not.toMatch(
      /data-agent-run-status|data-plugin-state|aria-busy/u,
    );
  });
});
