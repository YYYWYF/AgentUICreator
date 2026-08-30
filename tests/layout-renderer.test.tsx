import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import appUIJson from "../app-ui/app-ui.json";
import {
  parseAppUIModel,
  type AppUIModel,
} from "../framework/contracts/app-ui-model";
import { LayoutRenderer } from "../runtime/layout";

describe("LayoutRenderer", () => {
  it("renders the checked-in Row, Panel, and Slot composition", () => {
    const model = parseAppUIModel(appUIJson);

    const html = renderToStaticMarkup(
      <LayoutRenderer
        model={model}
        renderSlot={(slot) => (
          <article>{slot.pluginInstanceIds.join(",")}</article>
        )}
      />,
    );

    expect(html).toContain('data-layout-type="row"');
    expect(html).toContain('style="gap:12px;grid-template-columns:1fr 320px"');
    expect(html).toContain('data-layout-type="panel"');
    expect(html).toContain('data-resizable="true"');
    expect(html).toContain('data-slot-id="chat"');
    expect(html).toContain('data-slot-id="file-preview"');
    expect(html).toContain("chat-main");
    expect(html).toContain("file-preview-right");
  });

  it("maps numeric Column sizes to fractional grid tracks", () => {
    const model: AppUIModel = {
      version: "1",
      root: {
        type: "column",
        id: "main-column",
        sizes: [2, 1],
        children: [
          {
            type: "slot",
            id: "top-slot-node",
            slotId: "top",
            pluginInstanceIds: [],
          },
          {
            type: "slot",
            id: "bottom-slot-node",
            slotId: "bottom",
            pluginInstanceIds: [],
          },
        ],
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
      version: "1",
      root: {
        type: "stack",
        id: "preview-stack",
        active: "right-slot-node",
        children: [
          {
            type: "slot",
            id: "left-slot-node",
            slotId: "left-content",
            pluginInstanceIds: [],
          },
          {
            type: "slot",
            id: "right-slot-node",
            slotId: "right-content",
            pluginInstanceIds: [],
          },
        ],
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
      version: "1",
      root: {
        type: "slot",
        id: "empty-slot-node",
        slotId: "empty-slot",
        pluginInstanceIds: [],
      },
      pluginInstances: {},
    };

    const html = renderToStaticMarkup(<LayoutRenderer model={model} />);

    expect(html).toContain("app-ui-layout-slot-placeholder");
    expect(html).toContain("empty-slot");
  });
});
