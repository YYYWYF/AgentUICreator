// @vitest-environment jsdom
import { createServer, type Server } from "node:http";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { CreatorMockService } from "../src/mock/CreatorMockService.js";
import { handleCreatorMockRequest } from "../src/mock/mock-api.js";
import { CREATOR_MOCK_API_PATH } from "../src/mock/types.js";
import { MockServicePanel } from "../src/ui/MockServicePanel.js";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const nativeFetch = globalThis.fetch;
async function waitForUI(assertion: () => void) {
  await vi.waitFor(async () => {
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
    assertion();
  });
}
let root: Root | undefined;
let server: Server | undefined;
let service: CreatorMockService | undefined;
afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = undefined;
  document.body.replaceChildren();
  vi.unstubAllGlobals();
  await service?.dispose(); service = undefined;
  if (server) await new Promise<void>(resolve => { server!.close(() => resolve()); server!.closeAllConnections(); });
  server = undefined;
});

it("uses the chart Scenario declaration for Compatibility, the UI Run gate and the Server select gate", async () => {
  service = new CreatorMockService();
  let installed = false;
  const install = vi.fn(async () => { installed = true; });
  const inspector = async () => ({
    composition: {
      pluginSources: installed ? [{ pluginId: "chart-message", status: "available" as const, dataMessageUINames: ["chart"] }] : [],
      pluginInstances: installed ? [{ id: "chart", pluginId: "chart-message", enabled: true, effectiveEnabled: true, target: { type: "application" } }] : [],
    },
    sources: { items: [{ id: "plugin/chart-message", status: installed ? "managed" : "not-installed", resolvedRequirements: [] }] },
  });
  server = createServer((request, response) => {
    void handleCreatorMockRequest(request, response, service!, () => ({ id: "project", projectRoot: "/chart-project" }), undefined, inspector, install);
  });
  await new Promise<void>((resolve, reject) => { server!.once("error", reject); server!.listen(0, "127.0.0.1", resolve); });
  const address = server.address(); if (!address || typeof address === "string") throw new Error("Missing server address");
  const base = `http://127.0.0.1:${address.port}`;
  const post = (route: string, body: unknown) => nativeFetch(`${base}${route}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const compatibility = await (await nativeFetch(`${base}/compatibility`)).json();
  expect(compatibility.requirements.find((item: { id: string }) => item.id === "chart-message")).toMatchObject({ status: "missing", scenarioIds: ["data-message-chart"] });
  const summary = await (await nativeFetch(base)).json();
  expect(summary.scenarios.find((item: { id: string }) => item.id === "data-message-chart").resources).toEqual(["chart-message"]);

  const fetch = vi.fn(async (url: string, init?: RequestInit) => nativeFetch(`${base}${url.slice(CREATOR_MOCK_API_PATH.length)}`, init));
  vi.stubGlobal("fetch", fetch);
  const container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  await act(async () => { root!.render(<MockServicePanel projectId="project" />); });
  // The panel's initial HTTP requests outlive the render commit.
  await waitForUI(() => expect(container.querySelectorAll(".creator-mock-scenario").length).toBeGreaterThan(0));
  const card = [...container.querySelectorAll<HTMLElement>(".creator-mock-scenario")].find(element => element.textContent?.includes("在消息中展示自定义图表"))!;
  await act(async () => card.querySelector<HTMLInputElement>('input[type="radio"]')!.click());
  expect(fetch.mock.calls.some(([url]) => url.endsWith("/select"))).toBe(false);
  const run = [...card.querySelectorAll("button")].find(button => button.textContent === "运行场景")!;
  expect(run.disabled).toBe(true);
  expect(card.textContent).not.toContain("当前项目尚未安装 图表 资源。");
  expect(card.textContent).toContain("安装 图表 资源");
  const denied = await post("/select", { scenarioId: "data-message-chart", speed: 1 });
  expect(denied.status).toBe(400);
  expect((await denied.json()).error).toContain("请先安装");
  expect(service.getState().scenarioId).not.toBe("data-message-chart");

  const button = [...card.querySelectorAll("button")].find(button => button.textContent === "安装 图表 资源")!;
  await act(async () => button.click());
  await waitForUI(() => {
    expect(install).toHaveBeenCalledWith("project", "chart-message");
    expect(run.disabled).toBe(false);
  });
  expect(card.querySelector(".creator-mock-resource-row")).toBeNull();
  expect(fetch.mock.calls.some(([url]) => url.endsWith("/select"))).toBe(false);
  await act(async () => run.click());
  await waitForUI(() => expect(service!.getState().scenarioId).toBe("data-message-chart"));
  expect(fetch).toHaveBeenCalledWith(`${CREATOR_MOCK_API_PATH}/select`, expect.objectContaining({ body: JSON.stringify({ scenarioId: "data-message-chart", speed: 1 }) }));
  const selected = await post("/select", { scenarioId: "data-message-chart", speed: 1 });
  expect(selected.status).toBe(200);
  expect(await selected.json()).toMatchObject({ scenarioId: "data-message-chart" });
});
