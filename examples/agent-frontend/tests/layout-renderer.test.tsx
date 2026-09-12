import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LayoutRenderer } from "@agent-ui/runtime-react";

import appUIJson from "../app-ui/app-ui.json";
import {
  parseAppUIModel,
  type AppUIModel,
} from "../framework/contracts/app-ui-model";

describe("LayoutRenderer integration", () => {
  it("renders the checked-in two-column assistant-ui layout through the official Runtime", () => {
    const model = parseAppUIModel(appUIJson);
    expect(model.root.type).toBe("row");
    if (model.root.type !== "row") {
      throw new Error("Expected the Platform root to be a Row");
    }
    expect(model.root.children).toHaveLength(2);

    const html = renderToStaticMarkup(
      <LayoutRenderer
        root={model.root}
        theme={model.settings?.theme}
        version={model.version}
        renderSlot={(slot) => (
          <article>
            {slot.slotId}
          </article>
        )}
      />,
    );

    expect(html).toContain('data-layout-type="column"');
    expect(html).toContain('data-slot-id="workspace.conversation"');
    expect(html).not.toContain('data-slot-id="workspace.inspector"');
    expect(html).toContain("<article>workspace.conversation</article>");
    expect(html).not.toContain('data-slot-id="agent-welcome"');
    expect(html).not.toContain('data-slot-id="agent-messages"');
    expect(html).not.toContain('data-slot-id="agent-prompts"');
    expect(html).not.toContain('data-slot-id="agent-sender"');
  });

  it("renders a two-column AppUIModel without changing the Layout Runtime", () => {
    const platformModel = parseAppUIModel(appUIJson);
    if (platformModel.root.type !== "row") {
      throw new Error("Expected the Platform root to be a Row");
    }
    const model: AppUIModel = {
      ...platformModel,
      root: {
        ...platformModel.root,
        children: platformModel.root.children.slice(0, 2),
        sizes: platformModel.root.sizes?.slice(0, 2),
      },
    };

    const html = renderToStaticMarkup(
      <LayoutRenderer
        root={model.root}
        renderSlot={(slot) => <article>{slot.slotId}</article>}
        version={model.version}
      />,
    );

    expect(html).toContain('data-slot-id="agent-conversations"');
    expect(html).toContain('data-slot-id="workspace.conversation"');
    expect(html).not.toContain('data-slot-id="workspace.inspector"');
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
      pluginInstances: {},
    };

    const html = renderToStaticMarkup(
      <LayoutRenderer root={model.root} version={model.version} />,
    );

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
      pluginInstances: {},
    };

    const html = renderToStaticMarkup(
      <LayoutRenderer root={model.root} version={model.version} />,
    );

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
      pluginInstances: {},
    };

    const html = renderToStaticMarkup(
      <LayoutRenderer root={model.root} version={model.version} />,
    );

    expect(html).toContain("app-ui-layout-slot-placeholder");
    expect(html).toContain("empty-slot");
  });
});
