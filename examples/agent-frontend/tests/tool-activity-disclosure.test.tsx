// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import { useToolActivityDisclosure } from "../plugins/agent-tool-activity/tool-activity-disclosure";

const mountedRoots: Root[] = [];

function Fixture({ activityId }: { activityId: string }) {
  const disclosure = useToolActivityDisclosure({ activityId });
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

async function renderFixture(activityId: string) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  mountedRoots.push(root);
  const render = async (nextActivityId: string) => {
    await act(async () => root.render(<Fixture activityId={nextActivityId} />));
  };
  await render(activityId);
  return {
    expanded: () => container.querySelector("[data-expanded]")?.getAttribute("data-expanded"),
    render,
    toggle: async () => {
      const button = container.querySelector("button") as HTMLButtonElement;
      await act(async () => button.click());
    },
  };
}

afterEach(async () => {
  await act(async () => {
    for (const root of mountedRoots.splice(0)) root.unmount();
  });
  document.body.replaceChildren();
});

describe("useToolActivityDisclosure", () => {
  it("starts collapsed", async () => {
    const fixture = await renderFixture("activity-a");
    expect(fixture.expanded()).toBe("false");
  });

  it("lets the user toggle in both directions", async () => {
    const fixture = await renderFixture("activity-a");
    await fixture.toggle();
    expect(fixture.expanded()).toBe("true");
    await fixture.toggle();
    expect(fixture.expanded()).toBe("false");
  });

  it("keeps disclosure across ordinary rerenders of one activity", async () => {
    const fixture = await renderFixture("activity-a");
    await fixture.toggle();
    await fixture.render("activity-a");
    expect(fixture.expanded()).toBe("true");
  });

  it("resets disclosure when activity identity changes", async () => {
    const fixture = await renderFixture("activity-a");
    await fixture.toggle();
    expect(fixture.expanded()).toBe("true");
    await fixture.render("activity-b");
    expect(fixture.expanded()).toBe("false");
  });
});
