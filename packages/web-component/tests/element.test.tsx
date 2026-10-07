// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { act, createElement, useEffect } from "react";
import { resolveConfig } from "../src/config";
import { dispatchAgentUIEvent } from "../src/events";
import type { AgentUIConfig } from "../src/config";
import type { AgentUIElement } from "../src/AgentUIElement";
const calls = vi.hoisted(() => ({ mounted: 0, unmounted: 0, configs: [] as AgentUIConfig[] }));
vi.mock("../src/styles.css?inline", () => ({ default: ":host { display: block; }" }));
vi.mock("../src/AgentUIBridgeRoot", () => ({ AgentUIBridgeRoot: ({ config }: { config: AgentUIConfig }) => {
  calls.configs.push(config);
  useEffect(() => { calls.mounted++; return () => { calls.unmounted++; }; }, []);
  return createElement("div", { "data-shell": true });
} }));
let preRegistered: AgentUIElement;
beforeAll(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  preRegistered = document.createElement("agent-ui") as AgentUIElement;
  preRegistered.config = { endpoint: "/pre-registered" };
  document.body.append(preRegistered);
  await act(async () => { await import("../src/register"); });
});
afterEach(async () => { await act(async () => { document.body.replaceChildren(); }); });
async function mount(config?: AgentUIConfig) {
  const element = document.createElement("agent-ui");
  if (config) element.config = config;
  await act(async () => { document.body.append(element); });
  return element;
}
describe("host bridge lifecycle", () => {
  it("upgrades a property assigned before registration", () => {
    expect(preRegistered.config.endpoint).toBe("/pre-registered");
    expect(preRegistered.shadowRoot?.querySelector("[data-shell]")).not.toBeNull();
  });
  it("isolates mounts, coalesces configuration and reconnects after unmount", async () => {
    const element = await mount();
    const other = await mount({ endpoint: "/other" });
    const before = calls.mounted;
    await act(async () => {
      element.setAttribute("endpoint", "/attribute");
      element.config = { endpoint: "/property", locale: "zh-CN" };
    });
    expect(calls.configs.at(-1)?.endpoint).toBe("/property");
    expect(other.config.endpoint).toBe("/other");
    expect(calls.mounted).toBe(before);
    expect(element.querySelector("[data-shell]")).toBeNull();
    const unmounted = calls.unmounted;
    await act(async () => { element.remove(); });
    expect(calls.unmounted).toBe(unmounted + 1);
    await act(async () => { document.body.append(element); });
    expect(calls.mounted).toBe(before + 1);
  });
  it("retains the session for a synchronous DOM move", async () => {
    const element = await mount();
    const before = calls.mounted;
    const unmounted = calls.unmounted;
    await act(async () => { element.remove(); document.body.append(element); });
    expect(calls.mounted).toBe(before);
    expect(calls.unmounted).toBe(unmounted);
  });
  it("reports bad configuration without replacing the current render", async () => {
    const element = await mount();
    const listener = vi.fn();
    element.addEventListener("error", listener);
    await act(async () => { element.setAttribute("locale", "bad-locale"); });
    expect(listener).toHaveBeenCalledOnce();
    expect((listener.mock.calls[0]![0] as CustomEvent).detail.code).toBe("AGENT_UI_CONFIG_ERROR");
    expect(element.shadowRoot?.querySelector("[data-shell]")).not.toBeNull();
  });
  it("sends composed bubbling events to the Host", async () => {
    const element = await mount();
    const listener = vi.fn();
    document.body.addEventListener("thread-change", listener, { once: true });
    dispatchAgentUIEvent(element, "thread-change", { threadId: "thread-2" });
    const event = listener.mock.calls[0]![0] as CustomEvent;
    expect(event.detail).toEqual({ threadId: "thread-2" });
    expect(event.bubbles && event.composed).toBe(true);
  });
});
it("property config takes precedence over attributes and rejects invalid values", () => {
  const attrs = { endpoint: "/attribute", locale: "zh-CN", theme: "dark", "thread-id": null };
  expect(resolveConfig({ endpoint: "/property", theme: "light" }, attrs)).toMatchObject({ endpoint: "/property", locale: "zh-CN", theme: "light" });
  expect(() => resolveConfig({}, { ...attrs, theme: "invalid" })).toThrow();
});
