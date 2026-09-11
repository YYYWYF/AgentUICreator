// @vitest-environment jsdom

import { act, type ReactNode, useRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

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
          streaming={false}
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
  it("renders the assistant-ui-adapted disclosure anatomy", async () => {
    const { reasoning } = await renderReasoning({ streaming: true });

    expect(reasoning.tagName).toBe("SECTION");
    for (const slot of [
      "agent-reasoning-trigger",
      "agent-reasoning-trigger-icon",
      "agent-reasoning-label",
      "agent-reasoning-chevron",
      "agent-reasoning-content",
      "agent-reasoning-fade-top",
      "agent-reasoning-text",
      "agent-reasoning-text-content",
      "agent-reasoning-fade-bottom",
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
          streaming={false}
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

  it("announces animation before forwarding a manual disclosure change", async () => {
    const calls: string[] = [];
    const { trigger } = await renderReasoning({
      onAnimationStart: () => calls.push("animation"),
      onExpandedChange: () => calls.push("change"),
    });

    await act(async () => trigger.click());

    expect(calls).toEqual(["animation", "change"]);
  });

  it("uses active shimmer and aria-busy only while streaming, without a Spinner", async () => {
    const running = await renderReasoning({
      status: "running",
      streaming: true,
    });
    expect(running.reasoning.dataset.status).toBe("running");
    expect(running.reasoning.querySelector('[data-slot="spinner"]')).toBeNull();
    expect(running.reasoning.querySelector('[data-slot="agent-reasoning-label"]')
      ?.getAttribute("data-active")).toBe("true");
    expect(running.reasoning.querySelector('[data-slot="agent-reasoning-content"]')
      ?.getAttribute("aria-busy")).toBe("true");

    for (const status of ["completed", "interrupted"] as const) {
      const rendered = await renderReasoning({ status, streaming: false });
      expect(rendered.reasoning.querySelector('[data-slot="agent-reasoning-label"]')
        ?.getAttribute("data-active")).toBe("false");
      expect(rendered.reasoning.querySelector('[data-slot="agent-reasoning-content"]')
        ?.hasAttribute("aria-busy")).toBe(false);
      expect(rendered.reasoning.querySelector('[data-slot="agent-reasoning-fade-bottom"]'))
        .toBeNull();
    }
  });

  it("renders caller-owned labels, duration, variants, children, and refs", async () => {
    function Fixture() {
      const rootRef = useRef<HTMLElement>(null);
      const viewportRef = useRef<HTMLDivElement>(null);
      const contentRef = useRef<HTMLDivElement>(null);
      return (
        <AgentReasoning
          status="completed"
          expanded
          streaming={false}
          onExpandedChange={() => undefined}
          label={<strong>Custom reasoning</strong>}
          duration={12}
          variant="muted"
          rootRef={rootRef}
          textViewportRef={viewportRef}
          textContentRef={contentRef}
        >
          <div data-testid="custom-reasoning">Custom reasoning content</div>
        </AgentReasoning>
      );
    }

    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    mountedRoots.push(root);
    await act(async () => root.render(<AgentUIRoot><Fixture /></AgentUIRoot>));
    const reasoning = container.querySelector('[data-slot="agent-reasoning"]') as HTMLElement;

    expect(reasoning.dataset.variant).toBe("muted");
    expect(reasoning.querySelector('[data-slot="agent-reasoning-label"]')?.textContent)
      .toBe("Custom reasoning (12s)");
    expect(reasoning.querySelector('[data-testid="custom-reasoning"]')?.textContent)
      .toBe("Custom reasoning content");
  });

  it("merges className and only applies a caller-provided aria label", async () => {
    const labeled = await renderReasoning({
      ariaLabel: "Agent reasoning",
      className: "host-reasoning",
    });
    expect(labeled.reasoning.classList.contains("host-reasoning")).toBe(true);
    expect(labeled.reasoning.getAttribute("aria-label")).toBe("Agent reasoning");

    const unlabeled = await renderReasoning();
    expect(unlabeled.reasoning.hasAttribute("aria-label")).toBe(false);
  });
});
