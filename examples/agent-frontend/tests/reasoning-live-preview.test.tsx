// @vitest-environment jsdom

import { act, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  isReasoningPreviewAtBottom,
  useReasoningLivePreview,
} from "../plugins/agent-reasoning/reasoning-live-preview";

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

function Harness({
  streaming = true,
  expanded = true,
  resetKey = "reasoning-a",
}: {
  streaming?: boolean;
  expanded?: boolean;
  resetKey?: string;
}) {
  const textViewportRef = useRef<HTMLDivElement>(null);
  const textContentRef = useRef<HTMLDivElement>(null);
  useReasoningLivePreview({
    textViewportRef,
    textContentRef,
    streaming,
    expanded,
    resetKey,
  });

  return (
    <div data-testid="viewport" ref={textViewportRef}>
      <div ref={textContentRef}>Reasoning tokens</div>
    </div>
  );
}

async function renderHarness() {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  mountedRoots.push(root);
  const render = async (props: Parameters<typeof Harness>[0] = {}) => {
    await act(async () => root.render(<Harness {...props} />));
  };
  await render();
  return {
    render,
    viewport: container.querySelector('[data-testid="viewport"]') as HTMLDivElement,
  };
}

function installScrollMetrics(
  viewport: HTMLDivElement,
  initial: { scrollHeight: number; clientHeight: number; scrollTop: number },
) {
  const metrics = { ...initial };
  Object.defineProperties(viewport, {
    scrollHeight: { configurable: true, get: () => metrics.scrollHeight },
    clientHeight: { configurable: true, get: () => metrics.clientHeight },
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

async function triggerResize() {
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

describe("reasoning live preview", () => {
  it("recognizes the bottom with layout rounding tolerance", () => {
    expect(isReasoningPreviewAtBottom({
      scrollHeight: 600,
      clientHeight: 200,
      scrollTop: 399.5,
    })).toBe(true);
    expect(isReasoningPreviewAtBottom({
      scrollHeight: 600,
      clientHeight: 200,
      scrollTop: 390,
    })).toBe(false);
  });

  it("pins new streaming content to the bottom by default", async () => {
    const { render, viewport } = await renderHarness();
    const metrics = installScrollMetrics(viewport, {
      scrollHeight: 600,
      clientHeight: 200,
      scrollTop: 0,
    });
    await render({ resetKey: "reasoning-b" });

    expect(metrics.scrollTop).toBe(400);
    metrics.scrollHeight = 800;
    await triggerResize();
    expect(metrics.scrollTop).toBe(600);
  });

  it("stops following after user scrolls up and resumes at the bottom", async () => {
    const { render, viewport } = await renderHarness();
    const metrics = installScrollMetrics(viewport, {
      scrollHeight: 600,
      clientHeight: 200,
      scrollTop: 400,
    });
    await render({ resetKey: "reasoning-b" });

    metrics.scrollTop = 250;
    await dispatchScroll(viewport);
    metrics.scrollHeight = 800;
    await triggerResize();
    expect(metrics.scrollTop).toBe(250);

    metrics.scrollTop = 600;
    await dispatchScroll(viewport);
    metrics.scrollHeight = 900;
    await triggerResize();
    expect(metrics.scrollTop).toBe(700);
  });

  it("does not install follow behavior outside an expanded stream", async () => {
    const { render, viewport } = await renderHarness();
    const metrics = installScrollMetrics(viewport, {
      scrollHeight: 600,
      clientHeight: 200,
      scrollTop: 120,
    });
    await render({ streaming: false, expanded: true, resetKey: "idle" });

    expect(metrics.scrollTop).toBe(120);
  });
});
