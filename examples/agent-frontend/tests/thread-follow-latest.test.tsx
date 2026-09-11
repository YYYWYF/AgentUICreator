// @vitest-environment jsdom

import { act, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AgentThread } from "../agent-ui/components/thread";
import {
  getThreadBottomDistance,
  isThreadNearBottom,
  isThreadScrollable,
  useThreadFollowLatest,
} from "../plugins/agent-message-list/thread-follow-latest";

const mountedRoots: Root[] = [];

class ResizeObserverMock {
  static instances: ResizeObserverMock[] = [];

  private readonly callback: ResizeObserverCallback;

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
    ResizeObserverMock.instances.push(this);
  }

  observe() {}

  unobserve() {}

  disconnect() {}

  trigger() {
    this.callback([], this as unknown as ResizeObserver);
  }
}

function FollowLatestHarness({ resetKey }: { resetKey: string }) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const binding = useThreadFollowLatest({
    viewportRef,
    contentRef,
    resetKey,
  });

  return (
    <AgentThread
      viewportRef={viewportRef}
      contentRef={contentRef}
      scrollToBottom={
        binding.showScrollToBottom ? (
          <button onClick={binding.scrollToBottom}>Bottom</button>
        ) : undefined
      }
    >
      Content
    </AgentThread>
  );
}

async function renderHarness(resetKey = "thread-a") {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  mountedRoots.push(root);

  const rerender = async (nextResetKey: string) => {
    await act(async () => {
      root.render(<FollowLatestHarness resetKey={nextResetKey} />);
    });
  };

  await rerender(resetKey);

  return {
    container,
    rerender,
    viewport: container.querySelector(
      '[data-slot="agent-thread-viewport"]',
    ) as HTMLDivElement,
  };
}

function installScrollMetrics(
  viewport: HTMLDivElement,
  initial: {
    scrollHeight: number;
    clientHeight: number;
    scrollTop: number;
  },
) {
  const metrics = { ...initial };

  Object.defineProperties(viewport, {
    scrollHeight: {
      configurable: true,
      get: () => metrics.scrollHeight,
    },
    clientHeight: {
      configurable: true,
      get: () => metrics.clientHeight,
    },
    scrollTop: {
      configurable: true,
      get: () => metrics.scrollTop,
      set: (value: number) => {
        metrics.scrollTop = value;
      },
    },
  });

  return metrics;
}

async function dispatchScroll(viewport: HTMLDivElement) {
  await act(async () => {
    viewport.dispatchEvent(new Event("scroll"));
  });
}

async function triggerLatestResize() {
  const observer = ResizeObserverMock.instances.at(-1);
  if (observer === undefined) {
    throw new Error("ResizeObserver was not installed");
  }
  await act(async () => observer.trigger());
}

beforeEach(() => {
  ResizeObserverMock.instances = [];
  vi.stubGlobal("ResizeObserver", ResizeObserverMock);
});

afterEach(async () => {
  await act(async () => {
    for (const root of mountedRoots.splice(0)) root.unmount();
  });
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

describe("thread follow latest metrics", () => {
  it("calculates the remaining distance to the bottom", () => {
    expect(
      getThreadBottomDistance({
        scrollHeight: 1_000,
        clientHeight: 400,
        scrollTop: 600,
      }),
    ).toBe(0);
  });

  it("uses the bottom threshold without requiring exact equality", () => {
    expect(
      isThreadNearBottom({
        scrollHeight: 1_000,
        clientHeight: 400,
        scrollTop: 580,
      }),
    ).toBe(true);
    expect(
      isThreadNearBottom({
        scrollHeight: 1_000,
        clientHeight: 400,
        scrollTop: 570,
      }),
    ).toBe(false);
  });

  it("distinguishes scrollable content from layout rounding", () => {
    expect(
      isThreadScrollable({
        scrollHeight: 400,
        clientHeight: 400,
        scrollTop: 0,
      }),
    ).toBe(false);
    expect(
      isThreadScrollable({
        scrollHeight: 800,
        clientHeight: 400,
        scrollTop: 0,
      }),
    ).toBe(true);
  });
});

describe("useThreadFollowLatest", () => {
  it("moves to the bottom when the thread context resets", async () => {
    const { rerender, viewport } = await renderHarness();
    const metrics = installScrollMetrics(viewport, {
      scrollHeight: 1_000,
      clientHeight: 400,
      scrollTop: 0,
    });

    await rerender("thread-b");

    expect(metrics.scrollTop).toBe(600);
  });

  it("follows content growth while the user remains at the bottom", async () => {
    const { rerender, viewport } = await renderHarness();
    const metrics = installScrollMetrics(viewport, {
      scrollHeight: 1_000,
      clientHeight: 400,
      scrollTop: 600,
    });
    await rerender("thread-b");

    metrics.scrollHeight = 1_200;
    await triggerLatestResize();

    expect(metrics.scrollTop).toBe(800);
  });

  it("shows the button and preserves scroll position when content grows away from bottom", async () => {
    const { container, rerender, viewport } = await renderHarness();
    const metrics = installScrollMetrics(viewport, {
      scrollHeight: 1_000,
      clientHeight: 400,
      scrollTop: 600,
    });
    await rerender("thread-b");

    metrics.scrollTop = 300;
    await dispatchScroll(viewport);
    expect(container.querySelector("button")?.textContent).toBe("Bottom");

    metrics.scrollHeight = 1_200;
    await triggerLatestResize();

    expect(metrics.scrollTop).toBe(300);
    expect(container.querySelector("button")?.textContent).toBe("Bottom");
  });

  it("resumes following when the user manually returns to the bottom", async () => {
    const { container, rerender, viewport } = await renderHarness();
    const metrics = installScrollMetrics(viewport, {
      scrollHeight: 1_000,
      clientHeight: 400,
      scrollTop: 600,
    });
    await rerender("thread-b");
    metrics.scrollTop = 300;
    await dispatchScroll(viewport);

    metrics.scrollTop = 600;
    await dispatchScroll(viewport);
    expect(container.querySelector("button")).toBeNull();

    metrics.scrollHeight = 1_400;
    await triggerLatestResize();
    expect(metrics.scrollTop).toBe(1_000);
  });

  it("resumes following after the scroll-to-bottom action", async () => {
    const { container, rerender, viewport } = await renderHarness();
    const metrics = installScrollMetrics(viewport, {
      scrollHeight: 1_000,
      clientHeight: 400,
      scrollTop: 600,
    });
    await rerender("thread-b");
    metrics.scrollTop = 300;
    await dispatchScroll(viewport);

    await act(async () => {
      (container.querySelector("button") as HTMLButtonElement).click();
    });
    expect(metrics.scrollTop).toBe(600);
    expect(container.querySelector("button")).toBeNull();

    metrics.scrollHeight = 1_200;
    await triggerLatestResize();
    expect(metrics.scrollTop).toBe(800);
  });

  it("mounts safely when ResizeObserver is unavailable", async () => {
    vi.stubGlobal("ResizeObserver", undefined);

    const { container } = await renderHarness();

    expect(container.querySelector('[data-slot="agent-thread"]')).not.toBeNull();
  });
});
