// @vitest-environment jsdom

import { act, type ReactNode, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  AgentReasoning,
  type AgentReasoningProps,
} from "../agent-ui/components/reasoning";
import { AgentUIRoot } from "../agent-ui/foundation/AgentUIRoot";

const mountedRoots: Root[] = [];

async function renderReasoning(
  props: Partial<AgentReasoningProps> = {},
  children: ReactNode = "Analysis complete",
) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  mountedRoots.push(root);
  await act(async () => {
    root.render(
      <AgentUIRoot>
        <AgentReasoning
          status="completed"
          expanded
          onExpandedChange={() => undefined}
          label="Reasoning"
          {...props}
        >
          {children}
        </AgentReasoning>
      </AgentUIRoot>,
    );
  });
  const reasoning = container.querySelector(
    '[data-slot="agent-reasoning"]',
  ) as HTMLElement;
  const trigger = reasoning.querySelector(
    '[data-slot="agent-reasoning-trigger"]',
  ) as HTMLButtonElement;
  return { container, reasoning, trigger };
}

afterEach(async () => {
  await act(async () => {
    for (const root of mountedRoots.splice(0)) root.unmount();
  });
  document.body.replaceChildren();
});

describe("AgentReasoning", () => {
  it("renders the stable disclosure anatomy", async () => {
    const { reasoning } = await renderReasoning();

    expect(reasoning.tagName).toBe("SECTION");
    for (const slot of [
      "agent-reasoning-trigger",
      "agent-reasoning-status",
      "agent-reasoning-label",
      "agent-reasoning-chevron",
      "agent-reasoning-content",
      "agent-reasoning-body",
    ]) {
      expect(reasoning.querySelector(`[data-slot="${slot}"]`), slot).not.toBeNull();
    }
  });

  it("lets the caller control expanded state in both directions", async () => {
    function Fixture() {
      const [expanded, setExpanded] = useState(true);
      return (
        <AgentReasoning
          status="completed"
          expanded={expanded}
          onExpandedChange={setExpanded}
          label="Reasoning"
        >
          Controlled content
        </AgentReasoning>
      );
    }

    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    mountedRoots.push(root);
    await act(async () => root.render(<AgentUIRoot><Fixture /></AgentUIRoot>));

    const reasoning = container.querySelector('[data-slot="agent-reasoning"]') as HTMLElement;
    const trigger = reasoning.querySelector('[data-slot="agent-reasoning-trigger"]') as HTMLButtonElement;
    expect(reasoning.dataset.expanded).toBe("true");
    expect(trigger.getAttribute("aria-expanded")).toBe("true");

    await act(async () => trigger.click());
    expect(reasoning.dataset.expanded).toBe("false");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");

    await act(async () => trigger.click());
    expect(reasoning.dataset.expanded).toBe("true");
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
  });

  it("does not keep hidden expansion state", async () => {
    const onExpandedChange = vi.fn();
    const { reasoning, trigger } = await renderReasoning({ onExpandedChange });

    await act(async () => trigger.click());

    expect(onExpandedChange).toHaveBeenCalledWith(false);
    expect(reasoning.dataset.expanded).toBe("true");
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
  });

  it("shows a silent Spinner and busy state only while running", async () => {
    const running = await renderReasoning({ status: "running" });
    expect(running.reasoning.dataset.status).toBe("running");
    expect(running.reasoning.getAttribute("aria-busy")).toBe("true");
    const spinner = running.reasoning.querySelector('[data-slot="spinner"]');
    expect(spinner).not.toBeNull();
    expect(spinner?.getAttribute("aria-hidden")).toBe("true");
    expect(spinner?.hasAttribute("aria-label")).toBe(false);

    for (const status of ["completed", "interrupted"] as const) {
      const rendered = await renderReasoning({ status });
      expect(rendered.reasoning.dataset.status).toBe(status);
      expect(rendered.reasoning.hasAttribute("aria-busy")).toBe(false);
      expect(rendered.reasoning.querySelector('[data-slot="spinner"]')).toBeNull();
    }
  });

  it("renders only the caller-owned label and arbitrary children", async () => {
    const { reasoning } = await renderReasoning(
      { label: <strong>Custom reasoning</strong> },
      <div data-testid="custom-reasoning">Custom reasoning content</div>,
    );

    expect(reasoning.querySelector('[data-slot="agent-reasoning-label"]')?.textContent)
      .toBe("Custom reasoning");
    expect(reasoning.querySelector('[data-testid="custom-reasoning"]')?.textContent)
      .toBe("Custom reasoning content");
    expect(reasoning.textContent).not.toMatch(/正在思考|思考过程|思考已停止/u);
  });

  it("merges className and only applies a caller-provided aria label", async () => {
    const labeled = await renderReasoning({
      ariaLabel: "Agent reasoning",
      className: "host-reasoning",
    });
    expect(labeled.reasoning.classList.contains("host-reasoning")).toBe(true);
    expect(labeled.reasoning.classList.length).toBeGreaterThan(1);
    expect(labeled.reasoning.getAttribute("aria-label")).toBe("Agent reasoning");

    const unlabeled = await renderReasoning();
    expect(unlabeled.reasoning.hasAttribute("aria-label")).toBe(false);
  });

  it.each([
    ["running", false],
    ["completed", true],
    ["interrupted", true],
  ] as const)(
    "keeps status %s independent from expanded=%s",
    async (status, expanded) => {
      const { reasoning, trigger } = await renderReasoning({ status, expanded });
      expect(reasoning.dataset.expanded).toBe(String(expanded));
      expect(trigger.getAttribute("aria-expanded")).toBe(String(expanded));
    },
  );
});
