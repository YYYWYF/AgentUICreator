// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { installCreatorDock, CREATOR_DOCK_ID } from "../src/dock/creatorDock.js";
import { creatorDockMessages } from "../src/dock/messages.js";

const cleanups: Array<() => void> = [];
afterEach(() => { cleanups.splice(0).forEach(dispose => dispose()); document.body.replaceChildren(); history.replaceState(null, "", "/"); vi.restoreAllMocks(); });

it("opens a lazy iframe dock and preserves it when collapsed", () => {
  const app = document.createElement("main");
  app.textContent = "Host content";
  document.body.append(app);
  cleanups.push(installCreatorDock({ creatorUrl: "http://127.0.0.1:47832", workspaceId: "host-workspace", messages: creatorDockMessages("zh-CN") }));
  const shadow = document.getElementById(CREATOR_DOCK_ID)!.shadowRoot!;
  const button = shadow.querySelector("button")!;
  const frame = shadow.querySelector("iframe")!;
  expect(frame.hasAttribute("src")).toBe(false);
  expect(frame.hidden).toBe(true);
  button.click();
  expect(frame.src).toBe("http://127.0.0.1:47832/dock.html?workspace=host-workspace");
  expect(frame.hidden).toBe(false);
  expect(button.getAttribute("aria-expanded")).toBe("true");
  expect(button.textContent).toBe("收起 Creator");
  button.click();
  expect(frame.hidden).toBe(true);
  expect(frame.src).toContain("workspace=host-workspace");
  expect(app.textContent).toBe("Host content");
  expect(app.parentElement).toBe(document.body);
});

it("installs only once and skips workbench preview iframes", () => {
  const options = { creatorUrl: "http://127.0.0.1:47832", messages: creatorDockMessages("en-US") };
  const dispose = installCreatorDock(options);
  cleanups.push(dispose, installCreatorDock(options));
  expect(document.querySelectorAll(`#${CREATOR_DOCK_ID}`)).toHaveLength(1);
  dispose();
  history.replaceState(null, "", "/?creator-preview");
  cleanups.push(installCreatorDock(options));
  expect(document.getElementById(CREATOR_DOCK_ID)).toBeNull();
});

it("removes window listeners and uses the caller's locale messages", () => {
  const remove = vi.spyOn(window, "removeEventListener");
  const dispose = installCreatorDock({ creatorUrl: "http://127.0.0.1:47832", messages: creatorDockMessages("en-US") });
  const button = document.getElementById(CREATOR_DOCK_ID)!.shadowRoot!.querySelector("button")!;
  button.click();
  expect(button.textContent).toBe("Collapse Creator");
  dispose();
  expect(document.getElementById(CREATOR_DOCK_ID)).toBeNull();
  expect(remove).toHaveBeenCalledWith("resize", expect.any(Function));
});

it("opens immediately when requested by the standalone shell and can collapse", () => {
  cleanups.push(installCreatorDock({ creatorUrl: "http://127.0.0.1:47832", initiallyOpen: true,
    messages: creatorDockMessages("zh-CN") }));
  const shadow = document.getElementById(CREATOR_DOCK_ID)!.shadowRoot!;
  const frame = shadow.querySelector("iframe")!;
  const button = shadow.querySelector("button")!;
  expect(frame.src).toBe("http://127.0.0.1:47832/dock.html");
  expect(frame.hidden).toBe(false);
  expect(button.getAttribute("aria-expanded")).toBe("true");
  button.click();
  expect(frame.hidden).toBe(true);
});
