import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LayoutRenderer } from "@agent-ui/runtime-react";

import type { AppUIModel } from "../../../project-control/src/framework/contracts/app-ui-model";
import { compileAppUIModel } from "../../../project-control/src/framework/contracts/app-ui-compiler";
import { pluginCapabilityCatalog } from "../../../source-registry/registry/items/foundation-core/files/plugins/index";
import appUIJson from "../../../project-control/tests/fixtures/project/app-ui/app-ui.json";
import {
  parseAppUIRuntimeModel,
  type AppUIRuntimeModel,
} from "../../../project-control/src/framework/contracts/app-ui-runtime-model";

describe("LayoutRenderer integration", () => {
  it("renders the checked-in Conversation layout through the official Runtime", () => {
    const catalog = Object.fromEntries(pluginCapabilityCatalog.list().map(entry => [entry.manifest.id, {
      manifest: entry.manifest,
      ...(entry.manifest.capabilities === undefined ? {} : { capabilities: entry.manifest.capabilities }),
      ...(entry.manifest.slots?.children === undefined ? {} : { childSlots: entry.manifest.slots.children }),
    }]));
    const model = compileAppUIModel(appUIJson as AppUIModel, catalog);
    expect(model.root.type).toBe("row");
    if (model.root.type !== "row") {
      throw new Error("Expected the default root to be a Conversation row");
    }
    const html = renderToStaticMarkup(
      <LayoutRenderer
        root={model.root}
        renderSlot={(slot) => (
          <article>
            {slot.slotId}
          </article>
        )}
      />,
    );

    expect(html).toContain('data-layout-type="slot"');
    expect(html).toContain('data-slot-id="layout-slot:root.children%5B0%5D.child"');
    expect(html).toContain('data-slot-id="layout-slot:root.children%5B1%5D.child"');
    expect(html).not.toContain('data-slot-id="workspace.shell"');
    expect(html).not.toContain('data-slot-id="workspace.inspector"');
    expect(html).toContain("<article>layout-slot:root.children%5B0%5D.child</article>");
    expect(html).toContain("<article>layout-slot:root.children%5B1%5D.child</article>");
    expect(html).not.toContain('data-slot-id="agent-welcome"');
    expect(html).not.toContain('data-slot-id="legacy-messages"');
    expect(html).not.toContain('data-slot-id="agent-prompts"');
    expect(html).not.toContain('data-slot-id="agent-sender"');
  });

  it("renders a two-column AppUIRuntimeModel without changing the Layout Runtime", () => {
    const model: AppUIRuntimeModel = {
      pluginInstances: {},
      root: {
        type: "row",
        id: "two-column-fixture",
        children: [
          {
            type: "slot",
            id: "fixture-conversations-slot-node",
            slotId: "layout-slot:root.children%5B0%5D.child",
          },
          {
            type: "slot",
            id: "fixture-conversation-slot-node",
            slotId: "layout-slot:root.children%5B1%5D.child",
          },
        ],
        sizes: ["16rem", "minmax(0, 1fr)"],
      },
    };

    const html = renderToStaticMarkup(
      <LayoutRenderer
        root={model.root}
        renderSlot={(slot) => <article>{slot.slotId}</article>}
      />,
    );

    expect(html).toContain('data-slot-id="layout-slot:root.children%5B0%5D.child"');
    expect(html).toContain('data-slot-id="layout-slot:root.children%5B1%5D.child"');
    expect(html).not.toContain('data-slot-id="workspace.inspector"');
  });

  it("maps numeric Column sizes to fractional grid tracks", () => {
    const model: AppUIRuntimeModel = {
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
      <LayoutRenderer root={model.root} />,
    );

    expect(html).toContain('style="grid-template-rows:2fr 1fr"');
    expect(html).toContain('data-slot-id="top"');
    expect(html).toContain('data-slot-id="bottom"');
  });

  it("renders only the active Stack child", () => {
    const model: AppUIRuntimeModel = {
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
      <LayoutRenderer root={model.root} />,
    );

    expect(html).toContain('data-active-node-id="right-slot-node"');
    expect(html).toContain('data-slot-id="right-content"');
    expect(html).not.toContain('data-slot-id="left-content"');
  });

  it("renders a deterministic placeholder when no slot renderer is provided", () => {
    const model: AppUIRuntimeModel = {
      root: {
        type: "slot",
        id: "empty-slot-node",
        slotId: "empty-slot",
      },
      pluginInstances: {},
    };

    const html = renderToStaticMarkup(
      <LayoutRenderer root={model.root} />,
    );

    expect(html).toContain("app-ui-layout-slot-placeholder");
    expect(html).toContain("empty-slot");
  });
});
