// @vitest-environment jsdom

import { act, createRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  AgentComposerSuggestions,
  getAgentComposerSuggestionOptionId,
} from "../agent-ui/components/composer-suggestions";
import { AgentUIRoot } from "../agent-ui/foundation/AgentUIRoot";

const items = [
  {
    id: "summary",
    label: "总结当前会话",
    value: "请总结当前会话。",
    description: "提炼目标、约束和下一步",
  },
  {
    id: "tool",
    label: "解释工具调用",
    value: "请解释最近一次工具调用。",
  },
];
const mountedRoots: Root[] = [];

async function renderSuggestions(open: boolean, onSelect = vi.fn()) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  mountedRoots.push(root);
  const anchor = createRef<HTMLDivElement>();
  await act(async () => {
    root.render(
      <AgentUIRoot>
        <div ref={anchor} data-testid="anchor">
          <textarea aria-label="Composer" />
        </div>
        <AgentComposerSuggestions
          open={open}
          items={items}
          activeIndex={1}
          anchor={anchor}
          listId="agent-composer-suggestions"
          ariaLabel="快捷建议"
          onSelect={onSelect}
        />
      </AgentUIRoot>,
    );
  });
  return { container, onSelect };
}

afterEach(async () => {
  await act(async () => {
    for (const root of mountedRoots.splice(0)) root.unmount();
  });
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe("AgentComposerSuggestions", () => {
  it("does not render a popup while closed", async () => {
    const { container } = await renderSuggestions(false);
    expect(container.querySelector('[role="listbox"]')).toBeNull();
  });

  it("renders listbox options with a stable active descendant target", async () => {
    const { container } = await renderSuggestions(true);
    const portalHost = container.querySelector("[data-agent-ui-portal-host]") as HTMLElement;
    const listbox = portalHost.querySelector('[role="listbox"]');
    const positioner = portalHost.querySelector(
      '[data-slot="popover-positioner"]',
    ) as HTMLElement;
    const options = portalHost.querySelectorAll('[role="option"]');
    expect(listbox?.getAttribute("aria-label")).toBe("快捷建议");
    expect(options).toHaveLength(2);
    expect(options[1]?.getAttribute("aria-selected")).toBe("true");
    expect(options[1]?.id).toBe(
      getAgentComposerSuggestionOptionId("agent-composer-suggestions", "tool"),
    );
    expect(listbox?.closest("[data-agent-ui-portal-host]")).toBe(portalHost);
    expect(positioner.style.getPropertyValue("--anchor-width")).not.toBe("");
  });

  it("keeps Composer focus during pointer selection", async () => {
    const onSelect = vi.fn();
    const { container } = await renderSuggestions(true, onSelect);
    const textarea = container.querySelector("textarea") as HTMLTextAreaElement;
    const option = container.querySelector('[role="option"]') as HTMLButtonElement;
    textarea.focus();
    let mouseDown!: MouseEvent;
    await act(async () => {
      mouseDown = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
      option.dispatchEvent(mouseDown);
      option.click();
    });
    expect(mouseDown.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(textarea);
    expect(onSelect).toHaveBeenCalledWith(items[0], 0);
  });
});
