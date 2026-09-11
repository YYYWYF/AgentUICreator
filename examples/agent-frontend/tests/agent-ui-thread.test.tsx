// @vitest-environment jsdom

import { act, createRef, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import {
  AgentThread,
  type AgentThreadProps,
} from "../agent-ui/components/thread";
import { AgentUIRoot } from "../agent-ui/foundation/AgentUIRoot";

const mountedRoots: Root[] = [];

async function renderThread(
  props: AgentThreadProps = {},
  children?: ReactNode,
) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  mountedRoots.push(root);
  await act(async () => {
    root.render(
      <AgentUIRoot>
        <AgentThread {...props}>{children}</AgentThread>
      </AgentUIRoot>,
    );
  });
  const thread = container.querySelector(
    '[data-slot="agent-thread"]',
  ) as HTMLElement;
  return { container, thread };
}

afterEach(async () => {
  await act(async () => {
    for (const root of mountedRoots.splice(0)) root.unmount();
  });
  document.body.replaceChildren();
});

describe("AgentThread", () => {
  it("renders its stable semantic anatomy around arbitrary children", async () => {
    const { thread } = await renderThread({}, <span data-testid="message">Hello</span>);
    const viewport = thread.querySelector('[data-slot="agent-thread-viewport"]');
    const content = thread.querySelector('[data-slot="agent-thread-content"]');

    expect(thread.tagName).toBe("SECTION");
    expect(viewport).not.toBeNull();
    expect(content).not.toBeNull();
    expect(viewport?.firstElementChild).toBe(content);
    expect(content?.querySelector('[data-testid="message"]')?.textContent).toBe("Hello");
  });

  it("omits the scroll-to-bottom slot until the caller provides it", async () => {
    const { thread } = await renderThread();
    expect(thread.querySelector('[data-slot="agent-thread-scroll-to-bottom"]'))
      .toBeNull();
  });

  it("places a caller-owned scroll-to-bottom affordance in its optional slot", async () => {
    const { thread } = await renderThread({
      scrollToBottom: <button data-testid="scroll-button">Bottom</button>,
    });
    const slot = thread.querySelector('[data-slot="agent-thread-scroll-to-bottom"]');

    expect(slot).not.toBeNull();
    expect(slot?.querySelector('[data-testid="scroll-button"]')?.textContent).toBe("Bottom");
  });

  it.each([undefined, null])(
    "renders the empty slot for nullish children %s",
    async (children) => {
      const { thread } = await renderThread({
        empty: <div data-testid="empty">Empty</div>,
      }, children);
      expect(thread.querySelector('[data-testid="empty"]')?.textContent).toBe("Empty");
    },
  );

  it("prefers supplied children over the empty slot", async () => {
    const { thread } = await renderThread(
      { empty: <span>Empty</span> },
      <span>Message</span>,
    );
    expect(thread.textContent).toBe("Message");
  });

  it.each([
    ["zero", 0, "0"],
    ["empty string", "", ""],
    ["false", false, ""],
  ] as const)("preserves the %s ReactNode instead of using empty", async (_label, child, text) => {
    const { thread } = await renderThread({ empty: <span>Empty</span> }, child);
    expect(thread.textContent).toBe(text);
  });

  it("forwards viewportRef to the native scroll viewport", async () => {
    const viewportRef = createRef<HTMLDivElement>();
    await renderThread({ viewportRef });
    expect(viewportRef.current?.dataset.slot).toBe("agent-thread-viewport");
  });

  it("forwards contentRef to the content container", async () => {
    const contentRef = createRef<HTMLDivElement>();
    await renderThread({ contentRef });
    expect(contentRef.current?.dataset.slot).toBe("agent-thread-content");
  });

  it("merges a host class with its internal CSS Module class", async () => {
    const { thread } = await renderThread({ className: "host-thread" });
    expect(thread.classList.contains("host-thread")).toBe(true);
    expect(thread.classList.length).toBeGreaterThan(1);
  });

  it("uses only a caller-provided accessible label", async () => {
    const labeled = await renderThread({ ariaLabel: "Conversation messages" });
    expect(labeled.thread.getAttribute("aria-label")).toBe("Conversation messages");

    const unlabeled = await renderThread();
    expect(unlabeled.thread.hasAttribute("aria-label")).toBe(false);
  });

  it("does not invent business UI or live-region behavior", async () => {
    const { thread } = await renderThread();
    expect(thread.querySelector("button")).toBeNull();
    expect(thread.querySelector('[role="progressbar"]')).toBeNull();
    expect(thread.textContent).toBe("");
    expect(thread.hasAttribute("aria-live")).toBe(false);
  });
});
