// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { a2uiInteractiveOrderScenario } from "@agent-ui/mock-agent";
import { inspectMockDemoCompatibility } from "../src/mock/demo-compatibility.js";
import { MockServicePanel } from "../src/ui/MockServicePanel.js";
import { CREATOR_MOCK_API_PATH, type CreatorMockState } from "../src/mock/types.js";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | undefined;
afterEach(async () => { if (root) await act(async () => root!.unmount()); root = undefined; document.body.replaceChildren(); vi.unstubAllGlobals(); vi.useRealTimers(); });

const initial: CreatorMockState = { status: "stopped", endpoint: null, scenarioId: "simple-chat", speed: 1, scenarios: [
  { id: "simple-chat", title: "Simple Chat", description: "文本回复" },
  { id: "reasoning-chat", title: "Reasoning", description: "思考回复" },
] };
function json(value: unknown) { return new Response(JSON.stringify(value), { headers: { "Content-Type": "application/json" } }); }
async function render() {
  const container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  await act(async () => root!.render(<MockServicePanel />));
  return container;
}
async function click(container: HTMLElement, text: string) {
  const button = [...container.querySelectorAll("button")].find((element) => element.textContent === text);
  if (!button) throw new Error(`Missing ${text}`);
  await act(async () => button.click());
}

describe("Creator Mock service panel", () => {
  it("keeps installation errors and retry inside the Demo card without selecting its radio", async () => {
    const state = { ...initial, scenarios: [...initial.scenarios, { id: "data-message-chart", title: "Chart" }] };
    const compatibility = { projectId: "project", canInstall: true, status: "checked", requirements: [{ id: "chart-message", plugin: { id: "chart-message" }, name: "图表插件", scenarioIds: ["data-message-chart"], status: "missing" }] };
    const fetch = vi.fn(async (url: string) => {
      if (url.endsWith("/install-plugin")) return new Response(JSON.stringify({ error: "项目文件已改变，请重试。" }), { status: 400, headers: { "Content-Type": "application/json" } });
      return json(url.endsWith("/compatibility") ? compatibility : state);
    });
    vi.stubGlobal("fetch", fetch);
    const container = await render();
    expect(container.querySelectorAll(".creator-mock-preview")).toHaveLength(1);
    const actions = container.querySelector(".creator-mock-resource-actions")!;
    expect(actions.textContent).toContain("引入图表");
    expect(actions.querySelector(".creator-mock-preview img")?.getAttribute("alt")).toBe("图表插件示意图");
    await click(container, "引入图表");
    const card = [...container.querySelectorAll(".creator-mock-scenario")].find(element => element.textContent?.includes("data-message-chart"))!;
    expect(card.querySelector('[role="alert"]')?.textContent).toContain("项目文件已改变");
    expect(card.textContent).toContain("重试安装");
    expect(container.querySelector(".creator-mock-error")).toBeNull();
    expect(fetch.mock.calls.some(([url]) => url.endsWith("/select"))).toBe(false);
    expect(card.querySelector<HTMLInputElement>('input[type="radio"]')?.checked).toBe(false);
  });

  it("warns for the selected chart Demo and refreshes after Creator installs and enables it", async () => {
    vi.useFakeTimers();
    let status = "missing";
    const state = { ...initial, scenarioId: "data-message-chart", scenarios: [{ id: "data-message-chart", title: "Chart" }] };
    const compatibility = () => ({ projectId: "project", canInstall: true, status: "checked", requirements: [{ id: "chart-message", plugin: { id: "chart-message" }, name: "图表插件", scenarioIds: ["data-message-chart"], status }] });
    const fetch = vi.fn(async (url: string, _init?: RequestInit) => {
      if (url.endsWith("/install-plugin")) { status = "ready"; return json(compatibility()); }
      return json(url.endsWith("/compatibility") ? compatibility() : state);
    });
    vi.stubGlobal("fetch", fetch);
    const container = await render();
    expect(container.textContent).toContain("当前项目缺少图表插件");
    expect(container.textContent).toContain("引入图表");
    const card = container.querySelector(".creator-mock-scenario")!;
    expect(card.textContent).toContain("引入图表");
    expect(card.querySelector(".creator-mock-preview img")).not.toBeNull();
    expect(card.querySelector("button")?.closest("label")).toBeNull();
    expect(container.querySelector<HTMLInputElement>('input[type="radio"]')?.disabled).toBe(false);
    expect(fetch.mock.calls.some(([url]) => url.includes("/select") || url.includes("/start"))).toBe(false);
    status = "disabled";
    await act(async () => { await vi.advanceTimersByTimeAsync(4000); });
    expect(container.textContent).toContain("当前项目未启用或未正确放置图表插件");
    expect(container.textContent).toContain("启用图表");
    expect(card.querySelector(".creator-mock-preview")).toBeNull();
    await click(container, "启用图表");
    expect(fetch).toHaveBeenCalledWith(`${CREATOR_MOCK_API_PATH}/install-plugin`, expect.objectContaining({
      method: "POST", body: JSON.stringify({ projectId: "project", pluginId: "chart-message" }),
    }));
    expect(card.textContent).toContain("资源已安装并就绪，可以运行场景。");
    expect(container.textContent).not.toContain("当前项目缺少图表插件");
    expect(container.textContent).not.toContain("当前项目未启用或未正确放置图表插件");
    expect(card.querySelector(".creator-mock-preview")).toBeNull();
  });

  it("offers every missing resource and installs the clicked resource without selecting the Demo", async () => {
    const state = { ...initial, scenarios: [{ id: "approval-resume", title: "Approval" }] };
    const requirements = [
      { id: "assistant-ui-reasoning", plugin: { id: "assistant-ui-reasoning" }, name: "推理展示资源", scenarioIds: ["approval-resume"], status: "missing" },
      { id: "assistant-ui-tool-fallback", plugin: { id: "assistant-ui-tool-fallback" }, name: "工具调用与审批资源", scenarioIds: ["approval-resume"], status: "missing" },
      { id: "assistant-ui-tool-group", plugin: { id: "assistant-ui-tool-group" }, name: "工具分组资源", scenarioIds: ["approval-resume"], status: "disabled" },
    ];
    const compatibility = { projectId: "project", canInstall: true, status: "checked", requirements };
    const fetch = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/install-plugin")) {
        const { pluginId } = JSON.parse(String(init?.body));
        requirements.find(requirement => requirement.plugin.id === pluginId)!.status = "ready";
      }
      return json(url === CREATOR_MOCK_API_PATH ? state : compatibility);
    });
    vi.stubGlobal("fetch", fetch);
    const container = await render();
    expect(container.textContent).toContain("引入推理展示");
    expect(container.textContent).toContain("引入工具调用与审批");
    expect(container.textContent).toContain("启用工具分组");
    expect(container.querySelectorAll(".creator-mock-preview-help")).toHaveLength(2);
    await click(container, "引入工具调用与审批");
    expect(fetch).toHaveBeenCalledWith(`${CREATOR_MOCK_API_PATH}/install-plugin`, expect.objectContaining({
      body: JSON.stringify({ projectId: "project", pluginId: "assistant-ui-tool-fallback" }),
    }));
    expect(container.textContent).not.toContain("引入工具调用与审批");
    expect(container.textContent).toContain("引入推理展示");
    expect(fetch.mock.calls.some(([url]) => url.endsWith("/select"))).toBe(false);
  });

  it("starts the independent service, checks its cross-origin URL and preserves it on panel unmount", async () => {
    let state = initial;
    const fetch = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/start")) state = { ...state, status: "running", endpoint: "http://127.0.0.1:12345/agent" };
      if (url.endsWith("/stop")) state = { ...state, status: "stopped", endpoint: null };
      if (url.endsWith("/select")) state = { ...state, ...JSON.parse(String(init?.body)) };
      return json(state);
    });
    vi.stubGlobal("fetch", fetch);
    const container = await render();
    expect(container.querySelector(".creator-mock-preview")).toBeNull();
    await click(container, "启动服务");
    expect(container.querySelector(".creator-mock-status")?.textContent?.trim()).toBe("运行中");
    expect([...container.querySelectorAll("button")].some((button) => button.textContent === "停止服务")).toBe(true);
    expect(container.textContent).toContain('<Agent endpoint="http://127.0.0.1:12345/agent" />');
    expect(fetch).toHaveBeenCalledWith("http://127.0.0.1:12345/agent/scenarios");
    const copy = vi.fn(async () => undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText: copy } });
    await click(container, "复制地址");
    expect(copy).toHaveBeenCalledWith(state.endpoint);
    expect(container.querySelector(".creator-mock-copy")?.textContent?.trim()).toBe("✓ 已复制");
    await act(async () => { container.querySelectorAll<HTMLInputElement>('input[type="radio"]')[1]!.click(); });
    expect(state.scenarioId).toBe("reasoning-chat");
    await act(async () => root!.unmount()); root = undefined;
    expect(fetch.mock.calls.some(([url]) => url === `${CREATOR_MOCK_API_PATH}/stop`)).toBe(false);
    expect(state.status).toBe("running");
    const reopened = await render();
    expect(reopened.querySelector(".creator-mock-status")?.textContent?.trim()).toBe("运行中");
    expect(reopened.querySelector(".creator-mock-copy")?.textContent?.trim()).toBe("复制地址");
    await click(reopened, "停止服务");
    expect(state.endpoint).toBeNull();
    expect(reopened.querySelector(".creator-mock-status")?.textContent?.trim()).toBe("未运行");
  });

  it("shows recovery guidance when the Creator server still has old routes", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<!doctype html>", { headers: { "Content-Type": "text/html" } })));
    const container = await render();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("请重启 Creator 开发服务");
    expect(container.textContent).not.toContain("Unexpected token");
  });
});

it("shows optional resources and keeps Run disabled until the bundle is ready", async () => {
  const state = { ...initial, scenarios: [...initial.scenarios, { id: "frontend-tool-fill-form", title: "Frontend Tool · Fill Form", resources: [{ id: "frontend-tool-form", label: "Form", sourceItemId: "demo/frontend-tool-form" }] }] };
  let ready = false;
  const compatibility = () => ({ projectId: "project", canInstallResources: true, status: "checked", requirements: [{ id: "frontend-tool-form", plugin: { id: "frontend-tool-form-demo" }, sourceItemId: "demo/frontend-tool-form", name: "Form", scenarioIds: ["frontend-tool-fill-form"], status: ready ? "ready" : "missing", missingPackages: [] }] });
  const fetch = vi.fn(async (url: string) => {
    if (url.endsWith("/install-resources")) { ready = true; return json(compatibility()); }
    return json(url.endsWith("/compatibility") ? compatibility() : state);
  });
  vi.stubGlobal("fetch", fetch);
  const container = await render();
  const radio = container.querySelectorAll<HTMLInputElement>('input[type="radio"]')[2]!;
  await act(async () => radio.click());
  const run = [...container.querySelectorAll("button")].find(button => button.textContent === "运行场景")!;
  expect(run.disabled).toBe(true);
  await click(container, "安装资源");
  expect(run.disabled).toBe(false);
  expect(fetch).toHaveBeenCalledWith(`${CREATOR_MOCK_API_PATH}/install-resources`, expect.objectContaining({ body: JSON.stringify({ projectId: "project", sourceItemId: "demo/frontend-tool-form" }) }));
});

it("shows the A2UI resource installation path and enables Run only after compatibility is ready", async () => {
  let state = { ...initial, scenarios: [...initial.scenarios, a2uiInteractiveOrderScenario] };
  let installed = false;
  const compatibility = () => ({
    ...inspectMockDemoCompatibility({ pluginSources: [], pluginInstances: [] }, { items: [
      { id: "integration/a2ui", status: installed ? "managed" : "not-installed", resolvedRequirements: [] },
    ] }, "project"),
    canInstallResources: true,
  });
  const fetch = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith("/install-resources")) { installed = true; return json(compatibility()); }
    if (url.endsWith("/select")) { state = { ...state, scenarioId: JSON.parse(String(init?.body)).scenarioId }; }
    return json(url.endsWith("/compatibility") ? compatibility() : state);
  });
  vi.stubGlobal("fetch", fetch);
  const container = await render();
  const card = [...container.querySelectorAll<HTMLElement>(".creator-mock-scenario")].find(element => element.textContent?.includes("A2UI · Interactive Order Card"))!;
  expect(card.textContent).toContain("A2UI Official Integration");
  expect(card.textContent).toContain("安装资源");
  expect(card.textContent).not.toContain("Demo 资源已安装");
  await act(async () => card.querySelector<HTMLInputElement>('input[type="radio"]')!.click());
  const run = [...card.querySelectorAll("button")].find(button => button.textContent === "运行场景")!;
  expect(run.disabled).toBe(true);
  expect(card.textContent).toContain("此场景需要额外的 Agent UI 资源，请先安装资源。");
  expect(card.textContent).not.toContain("此场景使用 Frontend Tools");
  expect(fetch.mock.calls.some(([url]) => url.endsWith("/select"))).toBe(false);
  await click(card, "安装资源");
  expect(fetch).toHaveBeenCalledWith(`${CREATOR_MOCK_API_PATH}/install-resources`, expect.objectContaining({ body: JSON.stringify({ projectId: "project", sourceItemId: "integration/a2ui" }) }));
  expect(card.textContent).toContain("所需资源已就绪");
  expect(card.textContent).toContain("资源已安装并就绪，可以运行场景。");
  expect(card.textContent).not.toContain("并启用");
  expect(run.disabled).toBe(false);
  await click(card, "运行场景");
  expect(fetch).toHaveBeenCalledWith(`${CREATOR_MOCK_API_PATH}/select`, expect.objectContaining({ body: JSON.stringify({ scenarioId: "a2ui-interactive-order", speed: 1 }) }));
});
