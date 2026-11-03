// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { LayoutRenderer, type RowNode } from "../src/index.js";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); document.body.innerHTML = ""; });

it.each([0, 1])("opens navigation on its model side (drawer index %s) and retains desktop child order", async drawerIndex => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  let width = 1100;
  let resize: () => void = () => {};
  vi.stubGlobal("ResizeObserver", class { constructor(callback: () => void) { resize = callback; } observe() {} disconnect() {} });
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(() => width);
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    return { width: this.tagName === "DIALOG" ? 280 : 600 } as DOMRect;
  });
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
  const container = document.createElement("div"); document.body.append(container);
  const root = createRoot(container);
  const navigation = { type: "slot" as const, id: "navigation", slotId: "history" };
  const conversation = { type: "slot" as const, id: "conversation", slotId: "chat" };
  const node: RowNode = {
    type: "row", id: "workspace", sizes: drawerIndex === 0 ? ["280px", "1fr"] : ["1fr", "280px"],
    responsive: { type: "drawer", drawerIndex, primaryIndex: 1 - drawerIndex, minPrimaryWidth: 320 },
    children: drawerIndex === 0 ? [navigation, conversation] : [conversation, navigation],
  };
  await act(async () => root.render(<LayoutRenderer root={node} drawerLabels={{ open: "Open", close: "Close", collapse: "Collapse", restore: "Restore" }} renderSlot={slot => <div>{slot.slotId}</div>} />));
  const grid = container.querySelector<HTMLElement>('[data-layout-type="row"]')!;
  expect(grid.children[drawerIndex]!.tagName).toBe("DIALOG");
  expect(grid.style.gridTemplateColumns).toBe(drawerIndex === 0 ? "280px 1fr" : "1fr 280px");
  const toggle = container.querySelector<HTMLButtonElement>(".app-ui-layout-drawer-controls button")!;
  expect(toggle.getAttribute("aria-label")).toBe("Collapse");
  expect(toggle.getAttribute("aria-expanded")).toBe("true");
  expect(toggle.style.gridColumn).toBe(String(drawerIndex + 1));
  await act(async () => toggle.click());
  expect(grid.dataset.layoutDrawerState).toBe("collapsed");
  expect(toggle.getAttribute("aria-label")).toBe("Restore");
  expect(grid.style.gridTemplateColumns).toBe("1fr");
  await act(async () => toggle.click());
  expect(grid.dataset.layoutDrawerState).toBe("inline");
  expect(toggle.getAttribute("aria-expanded")).toBe("true");
  await act(async () => {
    width = 0; resize();
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
  });
  expect(grid.dataset.layoutDrawerState).toBe("inline");
  expect(grid.style.gridTemplateColumns).toBe(drawerIndex === 0 ? "280px 1fr" : "1fr 280px");
  await act(async () => {
    width = 400; resize();
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
  });
  await act(async () => container.querySelector<HTMLButtonElement>(".app-ui-layout-drawer-controls button")!.click());
  const drawer = container.querySelector("dialog")!;
  expect(drawer.open).toBe(true);
  expect(drawer.dataset.layoutDrawerSide).toBe(drawerIndex === 0 ? "left" : "right");
  expect(drawer.textContent).toContain("history");
  await act(async () => root.unmount());
});
