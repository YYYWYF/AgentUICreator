// @vitest-environment jsdom
import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LayoutRenderer, type RowNode } from "@agent-ui/runtime-react";

describe("responsive Row composition", () => {
  let root: Root | undefined;
  let host: HTMLElement | undefined;

  afterEach(async () => {
    if (root) await act(async () => root!.unmount());
    host?.remove();
    root = undefined;
    host = undefined;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    delete (HTMLDialogElement.prototype as Partial<HTMLDialogElement>).showModal;
    delete (HTMLDialogElement.prototype as Partial<HTMLDialogElement>).close;
  });

  it("reports invalid responsive indices instead of rendering a plain Row", async () => {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    const invalid: RowNode = {
      type: "row", id: "invalid", children: [{ type: "slot", id: "chat", slotId: "chat" }],
      responsive: { type: "trailing-drawer", primaryIndex: 1, drawerIndex: 2, minPrimaryWidth: 320 },
    };
    await expect(act(async () => root!.render(
      <LayoutRenderer root={invalid} renderSlot={() => null} />,
    ))).rejects.toThrow('Invalid responsive Row indices for "invalid".');
  });

  it("moves only the business track into one drawer and restores the same mounted instance", async () => {
    let width = 1280;
    let notifyResize = () => {};
    let mounts = 0;
    let unmounts = 0;
    vi.stubGlobal("ResizeObserver", class {
      constructor(private callback: ResizeObserverCallback) {}
      observe() { notifyResize = () => this.callback([], this as unknown as ResizeObserver); }
      disconnect() {}
    });
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(function (this: HTMLElement) {
      return this.hasAttribute("data-layout-responsive") ? width : 0;
    });
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
      const measuredWidth = this.tagName === "DIALOG" ? 260
        : this.getAttribute("data-slot-id") === "nav" ? 280 : 20;
      return { x: 0, y: 0, width: measuredWidth, height: 500, top: 0, right: measuredWidth,
        bottom: 500, left: 0, toJSON: () => ({}) };
    });
    HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
      this.setAttribute("open", "");
    };
    HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
      this.removeAttribute("open");
      this.dispatchEvent(new Event("close"));
    };
    const business = () => {
      useEffect(() => { mounts++; return () => { unmounts++; }; }, []);
      return <article data-testid="business">Business</article>;
    };
    const Business = business;
    const model: RowNode = {
      type: "row", id: "platform", gap: 0,
      responsive: { type: "trailing-drawer", primaryIndex: 1, drawerIndex: 2, minPrimaryWidth: 320 },
      sizes: ["280px", "minmax(0, 1fr)", "260px"],
      children: [
        { type: "slot", id: "nav", slotId: "nav" },
        { type: "slot", id: "chat", slotId: "chat" },
        { type: "slot", id: "business", slotId: "business" },
      ],
    };
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    await act(async () => root!.render(<LayoutRenderer root={model} renderSlot={(slot) =>
      slot.slotId === "business" ? <Business /> : <article>{slot.slotId}</article>
    } drawerLabels={{ open: "Open", close: "Close", collapse: "Collapse", restore: "Restore" }} />));
    const row = () => host!.querySelector<HTMLElement>("[data-layout-node-id=platform]")!;
    const shell = () => host!.querySelector<HTMLElement>("[data-layout-responsive]")!;
    const dialog = () => host!.querySelector<HTMLDialogElement>("dialog")!;
    const click = async (label: string) => act(async () => {
      const button = [...host!.querySelectorAll("button")].find((item) => item.textContent === label)!;
      button.click();
    });

    expect(row().style.gridTemplateColumns).toBe("280px minmax(0, 1fr) 260px");
    expect(shell().dataset.layoutResponsive).toBe("grid");
    width = 900;
    await act(async () => notifyResize());
    expect(shell().dataset.layoutResponsive).toBe("grid");
    width = 560;
    await act(async () => notifyResize());
    expect(shell().dataset.layoutResponsive).toBe("drawer");
    expect(row().style.gridTemplateColumns).toBe("280px minmax(0, 1fr)");
    await click("Open");
    expect(dialog().open).toBe(true);
    await click("Close");
    expect(dialog().open).toBe(false);
    width = 900;
    await act(async () => notifyResize());
    await click("Collapse");
    expect(row().style.gridTemplateColumns).toBe("280px minmax(0, 1fr)");
    await click("Restore");
    expect(row().style.gridTemplateColumns).toBe("280px minmax(0, 1fr) 260px");
    expect(host.querySelectorAll("[data-testid=business]")).toHaveLength(1);
    expect([mounts, unmounts]).toEqual([1, 0]);
  });
});
