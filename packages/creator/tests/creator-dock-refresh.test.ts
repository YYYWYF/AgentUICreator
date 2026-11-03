// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import { installCreatorDock } from "../src/dock/creatorDock.js";
import { creatorDockMessages } from "../src/dock/messages.js";

afterEach(() => { document.body.replaceChildren(); sessionStorage.clear(); });

it("restores an expanded panel after Host replacement and preserves an explicit collapse", () => {
  const options = { creatorUrl: "http://127.0.0.1:47832", workspaceId: "project", messages: creatorDockMessages("zh-CN") };
  const controls = () => {
    const shadow = document.getElementById("agent-ui-creator-dock")!.shadowRoot!;
    return { toggle: shadow.querySelector("button")!, frame: shadow.querySelector("iframe")! };
  };
  let dispose = installCreatorDock(options);
  expect(controls().frame.hasAttribute("src")).toBe(false);
  controls().toggle.click();
  expect(controls().frame.hidden).toBe(false);
  dispose();
  dispose = installCreatorDock(options);
  expect(controls().frame.hidden).toBe(false);
  expect(controls().frame.src).toContain("workspace=project");
  controls().toggle.click(); dispose();
  dispose = installCreatorDock(options);
  expect(controls().frame.hidden).toBe(true);
  expect(controls().frame.hasAttribute("src")).toBe(false);
  dispose();
});
