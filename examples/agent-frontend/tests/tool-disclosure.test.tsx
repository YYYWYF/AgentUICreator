// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import { useToolDisclosure } from "../plugins/agent-tool/tool-disclosure";

interface FixtureProps {
  toolCallId: string;
  defaultExpanded: boolean;
}

const mountedRoots: Root[] = [];

function Fixture({ toolCallId, defaultExpanded }: FixtureProps) {
  const disclosure = useToolDisclosure({ toolCallId, defaultExpanded });

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
        throw new Error("Tool disclosure toggle was not rendered");
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
});

describe("useToolDisclosure", () => {
  it("starts collapsed when defaultExpanded is false", async () => {
    const fixture = await renderFixture({
      toolCallId: "tool-a",
      defaultExpanded: false,
    });

    expect(fixture.expanded()).toBe("false");
  });

  it("starts expanded when defaultExpanded is true", async () => {
    const fixture = await renderFixture({
      toolCallId: "tool-a",
      defaultExpanded: true,
    });

    expect(fixture.expanded()).toBe("true");
  });

  it("lets the user toggle in both directions", async () => {
    const fixture = await renderFixture({
      toolCallId: "tool-a",
      defaultExpanded: false,
    });

    await fixture.toggle();
    expect(fixture.expanded()).toBe("true");

    await fixture.toggle();
    expect(fixture.expanded()).toBe("false");
  });

  it("keeps the user choice across ordinary rerenders of one occurrence", async () => {
    const props: FixtureProps = {
      toolCallId: "tool-a",
      defaultExpanded: false,
    };
    const fixture = await renderFixture(props);

    await fixture.toggle();
    expect(fixture.expanded()).toBe("true");

    await fixture.render({ ...props });
    expect(fixture.expanded()).toBe("true");
  });

  it("ignores a defaultExpanded change on the same occurrence", async () => {
    const fixture = await renderFixture({
      toolCallId: "tool-a",
      defaultExpanded: false,
    });

    await fixture.toggle();
    expect(fixture.expanded()).toBe("true");

    await fixture.render({ toolCallId: "tool-a", defaultExpanded: true });
    expect(fixture.expanded()).toBe("true");
  });

  it("resets disclosure when the tool call identity changes", async () => {
    const fixture = await renderFixture({
      toolCallId: "tool-a",
      defaultExpanded: false,
    });

    await fixture.toggle();
    expect(fixture.expanded()).toBe("true");

    await fixture.render({ toolCallId: "tool-b", defaultExpanded: false });
    expect(fixture.expanded()).toBe("false");

    await fixture.render({ toolCallId: "tool-c", defaultExpanded: true });
    expect(fixture.expanded()).toBe("true");
  });
});
