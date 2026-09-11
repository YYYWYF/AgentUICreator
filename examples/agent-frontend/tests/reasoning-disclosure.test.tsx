// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AgentReasoningStatus } from "../agent-ui/components/reasoning";
import { useReasoningDisclosure } from "../plugins/agent-reasoning/reasoning-disclosure";

interface FixtureProps {
  messageId: string;
  streaming: boolean;
  status: AgentReasoningStatus;
  defaultExpanded?: boolean;
  onAutomaticAnimationStart?(): void;
}

const mountedRoots: Root[] = [];

function Fixture({
  messageId,
  streaming,
  status,
  defaultExpanded = true,
  onAutomaticAnimationStart,
}: FixtureProps) {
  const disclosure = useReasoningDisclosure({
    messageId,
    streaming,
    status,
    defaultExpanded,
    onAutomaticAnimationStart,
  });

  return (
    <div data-expanded={disclosure.expanded ? "true" : "false"}>
      <button
        type="button"
        onClick={() => disclosure.onExpandedChange(!disclosure.expanded)}
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
    toggle: async () => {
      const button = container.querySelector("button");
      if (!(button instanceof HTMLButtonElement)) {
        throw new Error("Reasoning disclosure toggle was not rendered");
      }
      await act(async () => button.click());
    },
  };
}

afterEach(async () => {
  await act(async () => {
    for (const root of mountedRoots.splice(0)) root.unmount();
  });
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe("useReasoningDisclosure", () => {
  it("temporarily opens initial streaming over a collapsed default", async () => {
    const fixture = await renderFixture({
      messageId: "reasoning-a",
      streaming: true,
      status: "running",
      defaultExpanded: false,
    });

    expect(fixture.expanded()).toBe("true");
  });

  it("returns to the configured resting state when streaming completes", async () => {
    const running: FixtureProps = {
      messageId: "reasoning-resting",
      streaming: true,
      status: "running",
      defaultExpanded: false,
    };
    const fixture = await renderFixture(running);

    await fixture.render({ ...running, streaming: false, status: "completed" });

    expect(fixture.expanded()).toBe("false");
  });

  it("never lets streaming reclaim disclosure after a manual collapse", async () => {
    const running: FixtureProps = {
      messageId: "reasoning-manual-collapse",
      streaming: true,
      status: "running",
      defaultExpanded: false,
    };
    const fixture = await renderFixture(running);

    await fixture.toggle();
    await fixture.render({ ...running });
    await fixture.render({ ...running, streaming: false, status: "completed" });
    await fixture.render({ ...running });

    expect(fixture.expanded()).toBe("false");
  });

  it("keeps a manual open state after streaming completes", async () => {
    const resting: FixtureProps = {
      messageId: "reasoning-manual-open",
      streaming: false,
      status: "completed",
      defaultExpanded: false,
    };
    const fixture = await renderFixture(resting);

    await fixture.toggle();
    await fixture.render({ ...resting, streaming: true, status: "running" });
    await fixture.render(resting);

    expect(fixture.expanded()).toBe("true");
  });

  it("resets user ownership when message identity changes", async () => {
    const fixture = await renderFixture({
      messageId: "reasoning-a",
      streaming: true,
      status: "running",
      defaultExpanded: false,
    });
    await fixture.toggle();
    expect(fixture.expanded()).toBe("false");

    await fixture.render({
      messageId: "reasoning-b",
      streaming: true,
      status: "running",
      defaultExpanded: false,
    });

    expect(fixture.expanded()).toBe("true");
  });

  it("preserves the current disclosure state when reasoning is interrupted", async () => {
    const running: FixtureProps = {
      messageId: "reasoning-interrupted",
      streaming: true,
      status: "running",
      defaultExpanded: false,
    };
    const fixture = await renderFixture(running);

    await fixture.render({ ...running, streaming: false, status: "interrupted" });
    expect(fixture.expanded()).toBe("true");

    await fixture.render(running);
    await fixture.toggle();
    await fixture.render({ ...running, streaming: false, status: "interrupted" });
    expect(fixture.expanded()).toBe("false");
  });

  it("announces automatic disclosure animations without duplicating manual ones", async () => {
    const onAutomaticAnimationStart = vi.fn();
    const completed: FixtureProps = {
      messageId: "reasoning-animation",
      streaming: false,
      status: "completed",
      defaultExpanded: false,
      onAutomaticAnimationStart,
    };
    const fixture = await renderFixture(completed);

    await fixture.render({ ...completed, streaming: true, status: "running" });
    expect(onAutomaticAnimationStart).toHaveBeenCalledTimes(1);

    await fixture.toggle();
    expect(onAutomaticAnimationStart).toHaveBeenCalledTimes(1);
  });
});
