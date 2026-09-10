import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { LayoutRenderer, type LayoutNode } from "../src/index.js";

function slot(id: string): LayoutNode {
  return { type: "slot", id: `${id}-node`, slotId: id };
}

describe("LayoutRenderer", () => {
  it("renders Row children as horizontal grid tracks", () => {
    const html = renderToStaticMarkup(
      <LayoutRenderer
        root={{
          type: "row",
          id: "row",
          gap: 12,
          sizes: [2, "18rem"],
          children: [slot("left"), slot("right")],
        }}
      />,
    );

    expect(html).toContain('data-layout-type="row"');
    expect(html).toContain('style="gap:12px;grid-template-columns:2fr 18rem"');
  });

  it("renders Column children as vertical grid tracks", () => {
    const html = renderToStaticMarkup(
      <LayoutRenderer
        root={{
          type: "column",
          id: "column",
          sizes: [2, 1],
          children: [slot("top"), slot("bottom")],
        }}
      />,
    );

    expect(html).toContain('data-layout-type="column"');
    expect(html).toContain('style="grid-template-rows:2fr 1fr"');
  });

  it("divides Row and Column tracks evenly when sizes are omitted", () => {
    const rowHtml = renderToStaticMarkup(
      <LayoutRenderer
        root={{
          type: "row",
          id: "row",
          children: [slot("one"), slot("two"), slot("three")],
        }}
      />,
    );
    const columnHtml = renderToStaticMarkup(
      <LayoutRenderer
        root={{
          type: "column",
          id: "column",
          children: [slot("one"), slot("two")],
        }}
      />,
    );

    expect(rowHtml).toContain(
      'style="grid-template-columns:repeat(3, minmax(0, 1fr))"',
    );
    expect(columnHtml).toContain(
      'style="grid-template-rows:repeat(2, minmax(0, 1fr))"',
    );
  });

  it("applies Panel dimensions and resize behavior", () => {
    const html = renderToStaticMarkup(
      <LayoutRenderer
        root={{
          type: "panel",
          id: "panel",
          width: "24rem",
          height: 320,
          minWidth: 240,
          maxWidth: 480,
          resizable: true,
          child: slot("content"),
        }}
      />,
    );

    expect(html).toContain('data-resizable="true"');
    expect(html).toContain(
      'style="width:24rem;height:320px;min-width:240px;max-width:480px;overflow:auto;resize:horizontal"',
    );
  });

  it("renders the active Stack child", () => {
    const html = renderToStaticMarkup(
      <LayoutRenderer
        root={{
          type: "stack",
          id: "stack",
          active: "right-node",
          children: [slot("left"), slot("right")],
        }}
      />,
    );

    expect(html).toContain('data-active-node-id="right-node"');
    expect(html).toContain('data-slot-id="right"');
    expect(html).not.toContain('data-slot-id="left"');
  });

  it("uses the first Stack child when active is absent or unknown", () => {
    for (const active of [undefined, "missing"] as const) {
      const html = renderToStaticMarkup(
        <LayoutRenderer
          root={{
            type: "stack",
            id: "stack",
            ...(active === undefined ? {} : { active }),
            children: [slot("first"), slot("second")],
          }}
        />,
      );

      expect(html).toContain('data-active-node-id="first-node"');
      expect(html).toContain('data-slot-id="first"');
      expect(html).not.toContain('data-slot-id="second"');
    }
  });

  it("delegates Slot content to renderSlot", () => {
    const renderSlot = vi.fn((node: { slotId: string }) => (
      <article>{node.slotId}</article>
    ));

    const html = renderToStaticMarkup(
      <LayoutRenderer root={slot("content")} renderSlot={renderSlot} />,
    );

    expect(renderSlot).toHaveBeenCalledOnce();
    expect(html).toContain("<article>content</article>");
  });

  it("renders a deterministic Slot placeholder without renderSlot", () => {
    const html = renderToStaticMarkup(
      <LayoutRenderer root={slot("empty")} />,
    );

    expect(html).toContain("app-ui-layout-slot-placeholder");
    expect(html).toContain("empty");
  });

  it("projects version, theme, and className onto the root", () => {
    const html = renderToStaticMarkup(
      <LayoutRenderer
        className="custom-layout"
        root={slot("content")}
        theme="dark"
        version="2"
      />,
    );

    expect(html).toContain('class="app-ui-layout-root custom-layout"');
    expect(html).toContain('data-app-ui-version="2"');
    expect(html).toContain('data-theme="dark"');
  });
});
