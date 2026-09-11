// @vitest-environment jsdom

import { act, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useReasoningScrollLock } from "../plugins/agent-reasoning/reasoning-scroll-lock";

const mountedRoots: Root[] = [];

function Harness({ duration = 200 }: { duration?: number }) {
  const reasoningRef = useRef<HTMLDivElement>(null);
  const lockScroll = useReasoningScrollLock(reasoningRef, duration);
  return (
    <div data-testid="thread" style={{ overflowY: "auto", paddingRight: "4px" }}>
      <div ref={reasoningRef}>
        <button type="button" onClick={lockScroll}>animate</button>
      </div>
    </div>
  );
}

async function renderHarness() {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  mountedRoots.push(root);
  await act(async () => root.render(<Harness />));
  return {
    button: container.querySelector("button") as HTMLButtonElement,
    thread: container.querySelector('[data-testid="thread"]') as HTMLDivElement,
  };
}

beforeEach(() => vi.useFakeTimers());

afterEach(async () => {
  await act(async () => {
    for (const root of mountedRoots.splice(0)) root.unmount();
  });
  document.body.replaceChildren();
  vi.useRealTimers();
});

describe("reasoning scroll lock", () => {
  it("holds the nearest scrollable ancestor and restores its styles", async () => {
    const { button, thread } = await renderHarness();
    let scrollTop = 120;
    Object.defineProperties(thread, {
      scrollTop: {
        configurable: true,
        get: () => scrollTop,
        set: (value: number) => {
          scrollTop = value;
        },
      },
      offsetWidth: { configurable: true, get: () => 220 },
      clientWidth: { configurable: true, get: () => 200 },
    });
    thread.style.scrollbarWidth = "auto";

    await act(async () => button.click());
    expect(thread.style.scrollbarWidth).toBe("none");
    expect(thread.style.paddingRight).toBe("24px");

    scrollTop = 40;
    await act(async () => {
      thread.dispatchEvent(new Event("scroll"));
    });
    expect(scrollTop).toBe(120);

    await act(async () => vi.advanceTimersByTime(200));
    expect(thread.style.scrollbarWidth).toBe("auto");
    expect(thread.style.paddingRight).toBe("4px");

    scrollTop = 40;
    await act(async () => {
      thread.dispatchEvent(new Event("scroll"));
    });
    expect(scrollTop).toBe(40);
  });

  it("restores a prior lock before starting a new animation window", async () => {
    const { button, thread } = await renderHarness();
    Object.defineProperties(thread, {
      offsetWidth: { configurable: true, get: () => 200 },
      clientWidth: { configurable: true, get: () => 200 },
    });
    const clearTimeout = vi.spyOn(window, "clearTimeout");

    await act(async () => button.click());
    await act(async () => button.click());

    expect(clearTimeout).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(1);
  });
});
