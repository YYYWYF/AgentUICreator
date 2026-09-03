import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import appUIJson from "../app-ui/app-ui.json";
import {
  parseAppUIModel,
  type AppUIModel,
} from "../framework/contracts/app-ui-model";
import { LayoutRenderer } from "../runtime/layout";

describe("LayoutRenderer", () => {
  it("renders the checked-in Agent interface column and slots", () => {
    const model = parseAppUIModel(appUIJson);

    const html = renderToStaticMarkup(
      <LayoutRenderer
        model={model}
        renderSlot={(slot) => (
          <article>
            {model.slots[slot.slotId]?.occupants
              .map((occupant) => occupant.instanceId)
              .join(",")}
          </article>
        )}
      />,
    );

    expect(html).toContain('data-layout-type="column"');
    expect(html).toContain(
      'style="gap:0;grid-template-rows:auto auto minmax(0, 1fr) auto auto"',
    );
    expect(html).toContain('data-slot-id="agent-welcome"');
    expect(html).toContain('data-slot-id="agent-messages"');
    expect(html).toContain('data-slot-id="agent-prompts"');
    expect(html).toContain('data-slot-id="agent-sender"');
    expect(html).toContain("agent-welcome-main");
    expect(html).toContain("agent-sender-main");
  });

  it("maps numeric Column sizes to fractional grid tracks", () => {
    const model: AppUIModel = {
      version: "2",
      root: {
        type: "column",
        id: "main-column",
        sizes: [2, 1],
        children: [
          {
            type: "slot",
            id: "top-slot-node",
            slotId: "top",
          },
          {
            type: "slot",
            id: "bottom-slot-node",
            slotId: "bottom",
          },
        ],
      },
      slots: {
        top: {
          id: "top",
          kind: "single",
          scope: "root",
          description: "Top region.",
          owner: { type: "layout", nodeId: "top-slot-node" },
          occupants: [],
        },
        bottom: {
          id: "bottom",
          kind: "single",
          scope: "root",
          description: "Bottom region.",
          owner: { type: "layout", nodeId: "bottom-slot-node" },
          occupants: [],
        },
      },
      pluginInstances: {},
    };

    const html = renderToStaticMarkup(<LayoutRenderer model={model} />);

    expect(html).toContain('style="grid-template-rows:2fr 1fr"');
    expect(html).toContain('data-slot-id="top"');
    expect(html).toContain('data-slot-id="bottom"');
  });

  it("renders only the active Stack child", () => {
    const model: AppUIModel = {
      version: "2",
      root: {
        type: "stack",
        id: "preview-stack",
        active: "right-slot-node",
        children: [
          {
            type: "slot",
            id: "left-slot-node",
            slotId: "left-content",
          },
          {
            type: "slot",
            id: "right-slot-node",
            slotId: "right-content",
          },
        ],
      },
      slots: {
        "left-content": {
          id: "left-content",
          kind: "single",
          scope: "root",
          description: "Left Stack child.",
          owner: { type: "layout", nodeId: "left-slot-node" },
          occupants: [],
        },
        "right-content": {
          id: "right-content",
          kind: "single",
          scope: "root",
          description: "Right Stack child.",
          owner: { type: "layout", nodeId: "right-slot-node" },
          occupants: [],
        },
      },
      pluginInstances: {},
    };

    const html = renderToStaticMarkup(<LayoutRenderer model={model} />);

    expect(html).toContain('data-active-node-id="right-slot-node"');
    expect(html).toContain('data-slot-id="right-content"');
    expect(html).not.toContain('data-slot-id="left-content"');
  });

  it("renders a deterministic placeholder when no slot renderer is provided", () => {
    const model: AppUIModel = {
      version: "2",
      root: {
        type: "slot",
        id: "empty-slot-node",
        slotId: "empty-slot",
      },
      slots: {
        "empty-slot": {
          id: "empty-slot",
          kind: "single",
          scope: "root",
          description: "Empty region.",
          owner: { type: "layout", nodeId: "empty-slot-node" },
          occupants: [],
        },
      },
      pluginInstances: {},
    };

    const html = renderToStaticMarkup(<LayoutRenderer model={model} />);

    expect(html).toContain("app-ui-layout-slot-placeholder");
    expect(html).toContain("empty-slot");
  });
});
