// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AgentReasoningStatus } from "../agent-ui/components/reasoning";
import {
  DEFAULT_REASONING_COLLAPSE_DELAY_MS,
  resolveReasoningCollapseDelayMs,
  useReasoningDisclosure,
} from "../plugins/agent-reasoning/reasoning-disclosure";

interface FixtureProps {
  messageId: string;
  running: boolean;
  status: AgentReasoningStatus;
  defaultExpanded?: boolean;
  collapseOnComplete?: boolean;
  collapseDelayMs?: number;
}

const mountedRoots: Root[] = [];

function Fixture({
  messageId,
  running,
  status,
  defaultExpanded = true,
  collapseOnComplete = true,
  collapseDelayMs = DEFAULT_REASONING_COLLAPSE_DELAY_MS,
}: FixtureProps) {
  const disclosure = useReasoningDisclosure({
    messageId,
    running,
    status,
    defaultExpanded,
    collapseOnComplete,
    collapseDelayMs,
  });

  return (
    <div data-expanded={disclosure.expanded ? "true" : "false"}>
      <button
        type="button"
        onClick={() =>
          disclosure.onExpandedChange(!disclosure.expanded)
        }
      >
        toggle
      </button>
    </div>
  );
}

async function renderFixture(initialProps: FixtureProps) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  mountedRoots.push(root);

  const render = async (props: FixtureProps) => {
    await act(async () => root.render(<Fixture {...props} />));
  };
  await render(initialProps);

  return {
    expanded: () =>
      container.querySelector("[data-expanded]")?.getAttribute("data-expanded"),
    render,
    root,
    toggle: async () => {
      const button = container.querySelector("button");
      if (!(button instanceof HTMLButtonElement)) {
        throw new Error("Reasoning disclosure toggle was not rendered");
      }
      await act(async () => button.click());
    },
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(async () => {
  await act(async () => {
    for (const root of mountedRoots.splice(0)) root.unmount();
  });
  document.body.replaceChildren();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("useReasoningDisclosure", () => {
  it("opens an initially running occurrence regardless of defaultExpanded", async () => {
    const fixture = await renderFixture({
      messageId: "reasoning-a",
      running: true,
      status: "running",
      defaultExpanded: false,
    });

    expect(fixture.expanded()).toBe("true");
  });

  it("keeps initially completed history at its configured disclosure state", async () => {
    const expanded = await renderFixture({
      messageId: "history-expanded",
      running: false,
      status: "completed",
      defaultExpanded: true,
    });
    const collapsed = await renderFixture({
      messageId: "history-collapsed",
      running: false,
      status: "completed",
      defaultExpanded: false,
    });

    await act(async () => vi.advanceTimersByTime(5_000));

    expect(expanded.expanded()).toBe("true");
    expect(collapsed.expanded()).toBe("false");
  });

  it("opens once when a new running phase begins without fighting user collapse", async () => {
    const completedProps: FixtureProps = {
      messageId: "reasoning-phase",
      running: false,
      status: "completed",
      defaultExpanded: false,
    };
    const runningProps: FixtureProps = {
      ...completedProps,
      running: true,
      status: "running",
    };
    const fixture = await renderFixture(completedProps);

    await fixture.render(runningProps);
    expect(fixture.expanded()).toBe("true");

    await fixture.toggle();
    await fixture.render({ ...runningProps });
    expect(fixture.expanded()).toBe("false");
  });

  it("holds completed content for the full delay before collapsing", async () => {
    const runningProps: FixtureProps = {
      messageId: "reasoning-hold",
      running: true,
      status: "running",
    };
    const fixture = await renderFixture(runningProps);

    await fixture.render({
      ...runningProps,
      running: false,
      status: "completed",
    });
    expect(fixture.expanded()).toBe("true");

    await act(async () => vi.advanceTimersByTime(999));
    expect(fixture.expanded()).toBe("true");

    await act(async () => vi.advanceTimersByTime(1));
    expect(fixture.expanded()).toBe("false");
  });

  it("uses a configured non-default completion hold", async () => {
    const runningProps: FixtureProps = {
      messageId: "reasoning-custom-hold",
      running: true,
      status: "running",
      collapseDelayMs: 250,
    };
    const fixture = await renderFixture(runningProps);

    await fixture.render({
      ...runningProps,
      running: false,
      status: "completed",
    });
    await act(async () => vi.advanceTimersByTime(249));
    expect(fixture.expanded()).toBe("true");

    await act(async () => vi.advanceTimersByTime(1));
    expect(fixture.expanded()).toBe("false");
  });

  it("keeps completed reasoning open when auto-collapse is disabled", async () => {
    const runningProps: FixtureProps = {
      messageId: "reasoning-no-collapse",
      running: true,
      status: "running",
      collapseOnComplete: false,
    };
    const fixture = await renderFixture(runningProps);

    await fixture.render({
      ...runningProps,
      running: false,
      status: "completed",
    });
    await act(async () => vi.advanceTimersByTime(5_000));

    expect(fixture.expanded()).toBe("true");
  });

  it("collapses synchronously when collapseDelayMs is zero", async () => {
    const runningProps: FixtureProps = {
      messageId: "reasoning-immediate",
      running: true,
      status: "running",
      collapseDelayMs: 0,
    };
    const fixture = await renderFixture(runningProps);

    await fixture.render({
      ...runningProps,
      running: false,
      status: "completed",
    });

    expect(fixture.expanded()).toBe("false");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("lets user intent cancel a pending collapse permanently", async () => {
    const runningProps: FixtureProps = {
      messageId: "reasoning-user-intent",
      running: true,
      status: "running",
    };
    const fixture = await renderFixture(runningProps);

    await fixture.render({
      ...runningProps,
      running: false,
      status: "completed",
    });
    await act(async () => vi.advanceTimersByTime(300));
    await fixture.toggle();
    await fixture.toggle();
    await act(async () => vi.advanceTimersByTime(2_000));

    expect(fixture.expanded()).toBe("true");
  });

  it("does not auto-collapse again after the user reopens it", async () => {
    const runningProps: FixtureProps = {
      messageId: "reasoning-reopen",
      running: true,
      status: "running",
    };
    const completedProps: FixtureProps = {
      ...runningProps,
      running: false,
      status: "completed",
    };
    const fixture = await renderFixture(runningProps);

    await fixture.render(completedProps);
    await act(async () => vi.advanceTimersByTime(1_000));
    expect(fixture.expanded()).toBe("false");

    await fixture.toggle();
    await fixture.render({ ...completedProps });
    await act(async () => vi.advanceTimersByTime(2_000));
    expect(fixture.expanded()).toBe("true");
  });

  it("preserves the current disclosure state when reasoning is interrupted", async () => {
    const runningProps: FixtureProps = {
      messageId: "reasoning-interrupted",
      running: true,
      status: "running",
    };
    const fixture = await renderFixture(runningProps);

    await fixture.render({
      ...runningProps,
      running: false,
      status: "interrupted",
    });
    await act(async () => vi.advanceTimersByTime(2_000));
    expect(fixture.expanded()).toBe("true");

    await fixture.render(runningProps);
    await fixture.toggle();
    await fixture.render({
      ...runningProps,
      running: false,
      status: "interrupted",
    });
    await act(async () => vi.advanceTimersByTime(2_000));
    expect(fixture.expanded()).toBe("false");
  });

  it("resets lifecycle state and clears the old timer when message identity changes", async () => {
    const runningProps: FixtureProps = {
      messageId: "reasoning-a",
      running: true,
      status: "running",
    };
    const fixture = await renderFixture(runningProps);

    await fixture.render({
      ...runningProps,
      running: false,
      status: "completed",
    });
    await fixture.render({
      messageId: "reasoning-b",
      running: false,
      status: "completed",
      defaultExpanded: true,
    });
    await act(async () => vi.advanceTimersByTime(2_000));

    expect(fixture.expanded()).toBe("true");
  });

  it("clears a pending collapse when the occurrence unmounts", async () => {
    const clearTimeout = vi.spyOn(window, "clearTimeout");
    const runningProps: FixtureProps = {
      messageId: "reasoning-unmount",
      running: true,
      status: "running",
    };
    const fixture = await renderFixture(runningProps);
    await fixture.render({
      ...runningProps,
      running: false,
      status: "completed",
    });

    await act(async () => fixture.root.unmount());
    mountedRoots.splice(mountedRoots.indexOf(fixture.root), 1);

    expect(clearTimeout).toHaveBeenCalled();
  });
});

describe("resolveReasoningCollapseDelayMs", () => {
  it.each([
    [undefined, 1_000],
    ["100", 1_000],
    [-1, 1_000],
    [Number.NaN, 1_000],
    [0, 0],
    [2_500, 2_500],
  ])("resolves %p to %i", (value, expected) => {
    expect(resolveReasoningCollapseDelayMs(value)).toBe(expected);
  });
});
