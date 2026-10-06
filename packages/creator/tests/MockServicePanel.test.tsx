// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { a2uiInteractiveOrderScenario, frontendToolFillFormScenario } from "@agent-ui/mock-agent";
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
  it("groups related Demos together regardless of service order", async () => {
    const state = { ...initial, scenarios: [
      { id: "nested-subagent-error", title: "Subagent Error" },
      { id: "agent-status", title: "AgentStatus" },
      { id: "simple-chat", title: "Simple Chat" },
      { id: "nested-subagent-conversation", title: "Subagent Card" },
      { id: "data-message-chart", title: "Chart" },
      { id: "agent-plan", title: "AgentPlan" },
    ] };
    vi.stubGlobal("fetch", vi.fn(async (url: string) => json(url.endsWith("/compatibility")
      ? { projectId: "project", status: "checked", requirements: [] }
      : state)));
    const container = await render();
    expect([...container.querySelectorAll(".creator-mock-group-heading")].map(node => node.textContent)).toEqual([
      "对话与消息", "状态与计划", "内容组件", "子智能体",
    ]);
    expect([...container.querySelectorAll(".creator-mock-scenario-choice strong")].map(node => node.textContent)).toEqual([
      "纯文本流式回复", "通过工具参数展示执行计划", "通过工具参数展示 Agent 状态",
      "在消息中展示自定义图表", "子智能体任务卡片", "子智能体运行错误",
    ]);
  });

  it("shows descriptive Chinese Demo titles without exposing scenario IDs in cards", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => json(url.endsWith("/compatibility")
      ? { projectId: "project", status: "checked", requirements: [] }
      : initial)));
    const container = await render();
    const cards = container.querySelectorAll(".creator-mock-scenario");
    expect(cards[0]?.querySelector("strong")?.textContent).toBe("纯文本流式回复");
    expect(cards[1]?.querySelector("strong")?.textContent).toBe("思考后回复");
    expect(cards[0]?.textContent).not.toContain("simple-chat");
    expect(cards[0]?.querySelector("code")).toBeNull();
    await act(async () => {
      const search = container.querySelector<HTMLInputElement>(".creator-mock-search input")!;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(search, "reasoning-chat");
      search.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(container.querySelectorAll(".creator-mock-scenario")).toHaveLength(1);
  });

  it("keeps installation errors and retry inside the Demo card without selecting its radio", async () => {
    const state = { ...initial, scenarios: [...initial.scenarios, { id: "data-message-chart", title: "Chart" }] };
    const compatibility = { projectId: "project", canInstall: true, status: "checked", requirements: [{ id: "chart-message", name: "图表", scenarioIds: ["data-message-chart"], status: "missing", installable: true }] };
    const fetch = vi.fn(async (url: string) => {
      if (url.endsWith("/install-resources")) return new Response(JSON.stringify({ message: "图表 资源安装失败，请重试。" }), { status: 400, headers: { "Content-Type": "application/json" } });
      return json(url.endsWith("/compatibility") ? compatibility : state);
    });
    vi.stubGlobal("fetch", fetch);
    const container = await render();
    expect(container.querySelectorAll(".creator-mock-preview")).toHaveLength(1);
    const actions = container.querySelector(".creator-mock-resource-actions")!;
    expect(actions.textContent).toContain("安装 图表 资源");
    expect(actions.querySelector(".creator-mock-preview img")?.getAttribute("alt")).toBe("图表示意图");
    await click(container, "安装 图表 资源");
    const card = [...container.querySelectorAll(".creator-mock-scenario")].find(element => element.textContent?.includes("在消息中展示自定义图表"))!;
    expect(card.querySelector('[role="alert"]')?.textContent).toContain("图表 资源安装失败");
    expect(card.textContent).toContain("重试安装");
    expect(container.querySelector(".creator-mock-error")).toBeNull();
    expect(fetch.mock.calls.some(([url]) => url.endsWith("/select"))).toBe(false);
    expect(card.querySelector<HTMLInputElement>('input[type="radio"]')?.checked).toBe(false);
  });

  it("warns for the selected chart Demo and refreshes after Creator installs and enables it", async () => {
    vi.useFakeTimers();
    let status = "missing";
    const state = { ...initial, scenarioId: "data-message-chart", scenarios: [{ id: "data-message-chart", title: "Chart" }] };
    const compatibility = () => ({ projectId: "project", canInstall: true, status: "checked", requirements: [{ id: "chart-message", name: "图表", scenarioIds: ["data-message-chart"], status, installable: true }] });
    const fetch = vi.fn(async (url: string, _init?: RequestInit) => {
      if (url.endsWith("/install-resources")) { status = "ready"; return json(compatibility()); }
      return json(url.endsWith("/compatibility") ? compatibility() : state);
    });
    vi.stubGlobal("fetch", fetch);
    const container = await render();
    expect(container.textContent).not.toContain("当前项目尚未安装 图表 资源。");
    expect(container.textContent).toContain("安装 图表 资源");
    const card = container.querySelector(".creator-mock-scenario")!;
    expect(card.textContent).toContain("安装 图表 资源");
    expect(card.querySelector(".creator-mock-preview img")).not.toBeNull();
    expect(card.querySelector("button")?.closest("label")).toBeNull();
    expect(container.querySelector<HTMLInputElement>('input[type="radio"]')?.disabled).toBe(false);
    expect(fetch.mock.calls.some(([url]) => url.includes("/select") || url.includes("/start"))).toBe(false);
    status = "disabled";
    await act(async () => { await vi.advanceTimersByTimeAsync(4000); });
    expect(container.textContent).not.toContain("图表 资源未启用或未正确放置。");
    expect(container.textContent).toContain("修复 图表 资源");
    expect(card.querySelector(".creator-mock-preview")).toBeNull();
    await click(container, "修复 图表 资源");
    expect(fetch).toHaveBeenCalledWith(`${CREATOR_MOCK_API_PATH}/install-resources`, expect.objectContaining({
      method: "POST", body: JSON.stringify({ projectId: "project", resourceId: "chart-message" }),
    }));
    expect(card.textContent).toContain("资源已安装并就绪，可以运行场景。");
    expect(container.textContent).not.toContain("当前项目尚未安装 图表 资源。");
    expect(container.textContent).not.toContain("图表 资源未启用或未正确放置。");
    expect(card.querySelector(".creator-mock-preview")).toBeNull();
  });

  it("offers every missing resource and installs the clicked resource without selecting the Demo", async () => {
    const state = { ...initial, scenarios: [{ id: "approval-resume", title: "Approval", resources: ["reasoning", "tool-approval", "tool-group", "ready-resource"] }] };
    const requirements = [
      { id: "reasoning", name: "推理展示", scenarioIds: ["approval-resume"], status: "missing", installable: true },
      { id: "tool-approval", name: "工具调用与审批", scenarioIds: ["approval-resume"], status: "missing", installable: true },
      { id: "tool-group", name: "工具分组", scenarioIds: ["approval-resume"], status: "disabled", installable: true },
      { id: "ready-resource", name: "已就绪资源", scenarioIds: ["approval-resume"], status: "ready", installable: true },
    ];
    const compatibility = { projectId: "project", canInstall: true, status: "checked", requirements };
    const fetch = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/install-resources")) {
        const { resourceId } = JSON.parse(String(init?.body));
        requirements.find(requirement => requirement.id === resourceId)!.status = "ready";
      }
      return json(url === CREATOR_MOCK_API_PATH ? state : compatibility);
    });
    vi.stubGlobal("fetch", fetch);
    const container = await render();
    expect(container.textContent).toContain("安装 推理展示 资源");
    expect(container.textContent).toContain("安装 工具调用与审批 资源");
    expect(container.textContent).toContain("修复 工具分组 资源");
    expect(container.textContent).not.toContain("需要资源：");
    expect(container.querySelectorAll(".creator-mock-resource-row")).toHaveLength(3);
    expect(container.querySelectorAll(".creator-mock-preview-help")).toHaveLength(2);
    await click(container, "安装 工具调用与审批 资源");
    expect(fetch).toHaveBeenCalledWith(`${CREATOR_MOCK_API_PATH}/install-resources`, expect.objectContaining({
      body: JSON.stringify({ projectId: "project", resourceId: "tool-approval" }),
    }));
    expect(container.textContent).not.toContain("安装 工具调用与审批 资源");
    expect(container.textContent).not.toContain("需要资源：");
    expect(container.querySelectorAll(".creator-mock-resource-row")).toHaveLength(2);
    expect(container.textContent).toContain("安装 推理展示 资源");
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
  const state = { ...initial, scenarios: [...initial.scenarios, { id: "frontend-tool-fill-form", title: "Frontend Tool · Fill Form", resources: ["frontend-tool-form-demo"] }] };
  let ready = false;
  const compatibility = () => ({ projectId: "project", canInstallResources: true, status: "checked", requirements: [{ id: "frontend-tool-form-demo", name: "Form", scenarioIds: ["frontend-tool-fill-form"], status: ready ? "ready" : "missing", installable: true }] });
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
  await click(container, "安装 Form 资源");
  expect(run.disabled).toBe(false);
  expect(fetch).toHaveBeenCalledWith(`${CREATOR_MOCK_API_PATH}/install-resources`, expect.objectContaining({ body: JSON.stringify({ projectId: "project", resourceId: "frontend-tool-form-demo" }) }));
});

it("shows the A2UI resource installation path and enables Run only after compatibility is ready", async () => {
  let state = { ...initial, scenarios: [...initial.scenarios, a2uiInteractiveOrderScenario] };
  let installed = false;
  const compatibility = () => ({
    ...inspectMockDemoCompatibility({ pluginSources: [], pluginInstances: [] }, { items: [
      { id: "integration/a2ui", status: installed ? "managed" : "not-installed", owned: installed, resolvedRequirements: [] },
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
  const card = [...container.querySelectorAll<HTMLElement>(".creator-mock-scenario")].find(element => element.textContent?.includes("A2UI 订单确认卡片"))!;
  expect(card.textContent).not.toContain("需要资源：");
  expect(card.textContent).not.toContain("当前项目尚未安装 A2UI 资源。");
  expect(card.textContent).toContain("安装 A2UI 资源");
  expect(card.textContent).not.toContain("Demo 资源已安装");
  await act(async () => card.querySelector<HTMLInputElement>('input[type="radio"]')!.click());
  const run = [...card.querySelectorAll("button")].find(button => button.textContent === "运行场景")!;
  expect(run.disabled).toBe(true);
  expect(card.textContent).toContain("此场景需要额外的 Agent UI 资源，请先安装资源。");
  expect(card.textContent).not.toContain("此场景使用 Frontend Tools");
  expect(fetch.mock.calls.some(([url]) => url.endsWith("/select"))).toBe(false);
  await click(card, "安装 A2UI 资源");
  expect(fetch).toHaveBeenCalledWith(`${CREATOR_MOCK_API_PATH}/install-resources`, expect.objectContaining({ body: JSON.stringify({ projectId: "project", resourceId: "a2ui" }) }));
  expect(card.textContent).toContain("所需资源已就绪");
  expect(card.textContent).toContain("资源已安装并就绪，可以运行场景。");
  expect(card.textContent).not.toContain("并启用");
  expect(run.disabled).toBe(false);
  await click(card, "运行场景");
  expect(fetch).toHaveBeenCalledWith(`${CREATOR_MOCK_API_PATH}/select`, expect.objectContaining({ body: JSON.stringify({ scenarioId: "a2ui-interactive-order", speed: 1 }) }));
});

it("offers resource repair and blocks Run when an installed Form Provider is disabled", async () => {
  const state = { ...initial, scenarios: [...initial.scenarios, frontendToolFillFormScenario] };
  let enabled = false;
  const pluginId = "frontend-tool-form-demo";
  const compatibility = () => ({
    ...inspectMockDemoCompatibility({
      pluginSources: [{ pluginId, status: "available", dataMessageUINames: [] }],
      pluginInstances: [{ id: "form", pluginId, enabled, effectiveEnabled: enabled, target: { type: "layout_slot" } }],
    }, { items: [{ id: "demo/frontend-tool-form", status: "managed", owned: true, resolvedRequirements: [] }] }, "project"),
    canInstallResources: true,
  });
  const fetch = vi.fn(async (url: string) => {
    if (url.endsWith("/install-resources")) { enabled = true; return json(compatibility()); }
    return json(url.endsWith("/compatibility") ? compatibility() : state);
  });
  vi.stubGlobal("fetch", fetch);
  const container = await render();
  const card = [...container.querySelectorAll<HTMLElement>(".creator-mock-scenario")].find(element => element.textContent?.includes("前端工具填写表单"))!;
  await act(async () => card.querySelector<HTMLInputElement>('input[type="radio"]')!.click());
  const run = [...card.querySelectorAll("button")].find(button => button.textContent === "运行场景")!;
  expect(run.disabled).toBe(true);
  expect(card.textContent).not.toContain("未启用或未正确放置");
  expect(card.textContent).not.toContain("所需资源已就绪");
  await click(card, "修复 表单 Frontend Tool Demo 资源");
  expect(fetch).toHaveBeenCalledWith(`${CREATOR_MOCK_API_PATH}/install-resources`, expect.objectContaining({ body: JSON.stringify({ projectId: "project", resourceId: "frontend-tool-form-demo" }) }));
  expect(card.textContent).toContain("所需资源已就绪");
  expect(card.textContent).toContain("资源已安装并就绪，可以运行场景。");
  expect(run.disabled).toBe(false);
  expect(fetch.mock.calls.some(([url]) => url.endsWith("/select"))).toBe(false);
});

it("keeps missing A2UI packages installable without exposing implementation details in the DOM", async () => {
  const state = { ...initial, scenarios: [a2uiInteractiveOrderScenario] };
  const compatibility = { ...inspectMockDemoCompatibility({ pluginSources: [], pluginInstances: [] }, { items: [
    { id: "integration/a2ui", status: "not-installed", owned: false, resolvedRequirements: [
      { name: "@assistant-ui/react-generative-ui", required: "0.0.21", compatible: false },
      { name: "react-markdown", required: "10.1.0", compatible: false },
      { name: "remark-gfm", required: "4.0.1", compatible: false },
    ] },
  ] }, "project"), canInstallResources: true };
  vi.stubGlobal("fetch", vi.fn(async (url: string) => json(url.endsWith("/compatibility") ? compatibility : state)));
  const container = await render();
  const install = [...container.querySelectorAll("button")].find(button => button.textContent === "安装 A2UI 资源")!;
  expect(install.disabled).toBe(false);
  expect(container.textContent).not.toContain("当前项目尚未安装 A2UI 资源。");
  for (const token of ["@assistant-ui", "react-markdown", "remark-gfm", "pnpm add", "integration/a2ui", "A2UI Official Integration"]) expect(container.innerHTML).not.toContain(token);
});

it("fetches technical details only after the developer opens a conflicting resource", async () => {
  const state = { ...initial, scenarios: [a2uiInteractiveOrderScenario] };
  const compatibility = { ...inspectMockDemoCompatibility({ pluginSources: [], pluginInstances: [] }, { items: [
    { id: "integration/a2ui", status: "managed", owned: true, resolvedRequirements: [{ name: "@assistant-ui/react-generative-ui", required: "0.0.21", declared: "0.0.18", installed: "0.0.18", compatible: false }] },
  ] }, "project"), canInstallResources: true };
  const fetch = vi.fn(async (url: string) => json(url.endsWith("/resource-diagnostics") ? { technicalDetails: { name: "@assistant-ui/react-generative-ui", installed: "0.0.18", required: "0.0.21" } } : url.endsWith("/compatibility") ? compatibility : state));
  vi.stubGlobal("fetch", fetch);
  const container = await render();
  expect(container.textContent).not.toContain("A2UI 资源与当前项目存在兼容性冲突。");
  expect([...container.querySelectorAll("button")].find(button => button.textContent === "安装 A2UI 资源")!.disabled).toBe(true);
  expect(container.textContent).not.toContain("@assistant-ui");
  expect(fetch.mock.calls.some(([url]) => url.endsWith("/resource-diagnostics"))).toBe(false);
  const details = container.querySelector<HTMLDetailsElement>(".creator-mock-resource-diagnostics")!;
  await act(async () => { details.open = true; details.dispatchEvent(new Event("toggle")); });
  expect(fetch).toHaveBeenCalledWith(`${CREATOR_MOCK_API_PATH}/resource-diagnostics`, expect.objectContaining({ body: JSON.stringify({ projectId: "project", resourceId: "a2ui" }) }));
  expect(details.textContent).toContain("@assistant-ui/react-generative-ui");
});
