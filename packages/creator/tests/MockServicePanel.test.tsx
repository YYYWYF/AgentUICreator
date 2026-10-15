import { a2uiInteractiveOrderScenario } from "../src/mock-agent/builtins/a2ui-interactive-order.js";
// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { frontendToolFillFormScenario, showcaseMockScenarios } from "@za38.03/agent-ui-creator/mock-agent";
import { inspectMockDemoCompatibility } from "../src/mock/demo-compatibility.js";
import { MockServicePanel } from "../src/ui/MockServicePanel.js";
import { publishCreatorRefresh } from "../src/ui/creatorRefresh.js";
import { CREATOR_MOCK_API_PATH, type CreatorMockState } from "../src/mock/types.js";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | undefined;
afterEach(async () => { if (root) await act(async () => root!.unmount()); root = undefined; document.body.replaceChildren(); vi.unstubAllGlobals(); vi.useRealTimers(); });

const initial: CreatorMockState = { status: "stopped", endpoint: null, scenarioId: "simple-chat", speed: 1, selection: { type: "builtin", id: "simple-chat" }, projectId: null, recordings: [], scenarios: [
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
  it("shows newly read local files after an overall refresh without changing selection", async () => {
    const current: CreatorMockState = { ...initial, projectId: "project" };
    vi.stubGlobal("fetch", vi.fn(async (url: string) => json(url.endsWith("/compatibility")
      ? { projectId: "project", status: "checked", requirements: [] } : current)));
    const container = await render();
    expect(container.textContent).toContain("当前项目还没有本地 Mock 文件");
    await act(async () => publishCreatorRefresh({ projectId: "project", mock: {
      ...current, recordings: [{ id: "local:new.jsonl", title: "新回放", fileName: "new.jsonl", eventCount: 8, durationMs: 3200, status: "ready" }],
    } }));
    expect(container.querySelector('[aria-label="本地 Mock"]')?.textContent).toContain("新回放");
    expect(container.querySelector<HTMLInputElement>('.creator-mock-scenarios input[type="radio"]')?.checked).toBe(true);
  });
  it("places all conversation demos into seven groups without a catch-all", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => json(url.endsWith("/compatibility")
      ? { projectId: "project", status: "checked", requirements: [] }
      : { ...initial, scenarios: [...showcaseMockScenarios].reverse() })));
    const container = await render();
    expect([...container.querySelectorAll(".creator-mock-group-heading")].map(node => node.textContent)).toEqual([
      "消息与上下文", "思考与工具", "提问与审批", "状态与执行计划",
      "结构化结果与交互界面", "子智能体协作", "运行控制与恢复",
    ]);
    expect(container.querySelectorAll(".creator-mock-scenarios .creator-mock-scenario")).toHaveLength(showcaseMockScenarios.length);
    expect(container.textContent).not.toContain("其他示例");
    expect(container.textContent).toContain("刷新后恢复执行计划进度");
    expect(container.textContent).toContain("回答中展示来源引用");
  });

  it("switches ready resource scenarios directly from the card or radio without a Run button", async () => {
    let state = { ...initial, scenarios: [...initial.scenarios, { id: "nested-subagent-conversation", title: "Subagent", resources: ["task-card"] }] };
    const fetch = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/compatibility")) return json({ projectId: "project", status: "checked", requirements: [{ id: "task-card", scenarioIds: ["nested-subagent-conversation"], status: "ready" }] });
      if (url.endsWith("/select")) {
        const { scenarioId } = JSON.parse(String(init?.body));
        state = { ...state, scenarioId, selection: { type: "builtin", id: scenarioId } };
      }
      return json(state);
    });
    vi.stubGlobal("fetch", fetch);
    const container = await render();
    const card = [...container.querySelectorAll<HTMLElement>(".creator-mock-scenario")].find(element => element.textContent?.includes("子智能体任务卡片"))!;
    expect([...container.querySelectorAll("button")].some(button => button.textContent === "运行场景")).toBe(false);
    await act(async () => card.click());
    expect(state.scenarioId).toBe("nested-subagent-conversation");
    const radio = card.querySelector<HTMLInputElement>('input[type="radio"]')!;
    expect(radio.checked).toBe(true);
    expect(card.dataset.selected).toBe("true");
    expect(fetch.mock.calls.filter(([url]) => url.endsWith("/select"))).toHaveLength(1);
    await act(async () => radio.click());
    expect(fetch.mock.calls.filter(([url]) => url.endsWith("/select"))).toHaveLength(2);
  });

  it("shows local recordings, disables invalid files and sends project-scoped selection", async () => {
    const state: CreatorMockState = { ...initial, projectId: "A", recordings: [
      { id: "local:chat.jsonl", title: "chat", fileName: "chat.jsonl", eventCount: 12, durationMs: 4800, status: "ready" },
      { id: "local:broken.jsonl", title: "broken", fileName: "broken.jsonl", eventCount: 0, durationMs: 0, status: "invalid", error: "Line 18: invalid AG-UI event." },
    ] };
    const fetcher = vi.fn(async (url: string, options?: RequestInit) => {
      if (url.endsWith("/compatibility")) return json({ projectId: "A", status: "checked", requirements: [] });
      if (url.endsWith("/select")) return json({ ...state, selection: JSON.parse(String(options?.body)).selection });
      return json(state);
    });
    vi.stubGlobal("fetch", fetcher);
    const container = await render();
    const local = container.querySelector<HTMLElement>('[aria-label="本地 Mock"]')!;
    expect(local.textContent).toContain("12 events · 4.8s");
    expect(local.textContent).toContain("Line 18");
    expect(local.querySelectorAll<HTMLInputElement>('input[type="radio"]')[1]?.disabled).toBe(true);
    await act(async () => local.querySelector<HTMLInputElement>('input[type="radio"]')!.click());
    const request = fetcher.mock.calls.find(([url]) => url.endsWith("/select"));
    expect(JSON.parse(String(request?.[1]?.body))).toEqual({ selection: { type: "recording", id: "local:chat.jsonl" }, projectId: "A", speed: 1 });
    expect(container.textContent).toContain("来源：本地 Recording");
    expect(container.querySelector<HTMLInputElement>('.creator-mock-scenarios input[type="radio"]')?.checked).toBe(false);
  });

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
      "消息与上下文", "状态与执行计划", "结构化结果与交互界面", "子智能体协作",
    ]);
    expect([...container.querySelectorAll(".creator-mock-scenario-choice strong")].map(node => node.textContent)).toEqual([
      "纯文本流式回复", "通过 Activity 事件展示执行计划", "通过工具参数展示 Agent 状态",
      "在消息中展示自定义图表", "子智能体任务卡片", "子智能体运行错误",
    ]);
    const cards = [...container.querySelectorAll(".creator-mock-scenario")];
    const tagsFor = (title: string) => [...cards.find(card => card.querySelector("strong")?.textContent === title)!
      .querySelectorAll('.creator-mock-focus-tags [data-slot="badge"]')].map(tag => tag.textContent);
    expect(tagsFor("子智能体任务卡片")).toEqual(["SUBAGENT_STARTED", "SUBAGENT_FINISHED"]);
    expect(tagsFor("子智能体运行错误")).toEqual(["SUBAGENT_STARTED", "SUBAGENT_ERROR"]);
    expect(tagsFor("通过 Activity 事件展示执行计划")).toEqual(["ACTIVITY_SNAPSHOT", "ACTIVITY_DELTA"]);
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
    await act(async () => {
      const search = container.querySelector<HTMLInputElement>(".creator-mock-search input")!;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(search, "TEXT_MESSAGE");
      search.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(container.querySelectorAll(".creator-mock-scenario")).toHaveLength(1);
    expect(container.querySelector(".creator-mock-scenario strong")?.textContent).toBe("纯文本流式回复");
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
    expect(container.querySelector(".creator-mock-preview")).toBeNull();
    expect(container.textContent).toContain("安装资源");
    await click(container, "安装资源");
    const card = [...container.querySelectorAll(".creator-mock-scenario")].find(element => element.textContent?.includes("在消息中展示自定义图表"))!;
    expect(card.querySelector('[role="alert"]')?.textContent).toContain("图表 资源安装失败");
    expect(card.textContent).toContain("安装资源");
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
    expect(container.textContent).toContain("安装资源");
    const card = container.querySelector(".creator-mock-scenario")!;
    expect(card.textContent).toContain("安装资源");
    expect(card.querySelector(".creator-mock-preview img")).toBeNull();
    expect(card.querySelector("button")?.closest("label")).toBeNull();
    expect(container.querySelector<HTMLInputElement>('input[type="radio"]')?.disabled).toBe(false);
    expect(fetch.mock.calls.some(([url]) => url.includes("/select") || url.includes("/start"))).toBe(false);
    status = "disabled";
    await act(async () => { await vi.advanceTimersByTimeAsync(4000); });
    expect(container.textContent).not.toContain("图表 资源未启用或未正确放置。");
    expect(container.textContent).toContain("安装资源");
    expect(card.querySelector(".creator-mock-preview")).toBeNull();
    await click(container, "安装资源");
    expect(fetch).toHaveBeenCalledWith(`${CREATOR_MOCK_API_PATH}/install-resources`, expect.objectContaining({
      method: "POST", body: JSON.stringify({ projectId: "project", resourceId: "chart-message" }),
    }));
    expect(card.textContent).toContain("资源已安装并就绪，点击场景即可切换。");
    expect(container.textContent).not.toContain("当前项目尚未安装 图表 资源。");
    expect(container.textContent).not.toContain("图表 资源未启用或未正确放置。");
    expect(card.querySelector(".creator-mock-preview")).toBeNull();
  });

  it("installs all missing and disabled Demo resources with one click, skipping ready resources", async () => {
    const state = { ...initial, scenarios: [{ id: "approval-resume", title: "Approval", resources: ["reasoning", "tool-approval", "tool-group", "ready-resource"] }] };
    const requirements = [
      { id: "reasoning", name: "推理展示", scenarioIds: ["approval-resume"], status: "missing", installable: true },
      { id: "tool-approval", name: "工具调用与审批", scenarioIds: ["approval-resume"], status: "missing", installable: true },
      { id: "tool-group", name: "工具分组", scenarioIds: ["approval-resume"], status: "disabled", installable: true },
      { id: "ready-resource", name: "已就绪资源", scenarioIds: ["approval-resume"], status: "ready", installable: true },
    ];
    const compatibility = { projectId: "project", canInstall: true, status: "checked", requirements };
    const installed: string[] = [];
    const fetch = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/install-resources")) {
        const { resourceId } = JSON.parse(String(init?.body));
        installed.push(resourceId);
        requirements.find(requirement => requirement.id === resourceId)!.status = "ready";
      }
      return json(url.endsWith("/compatibility") || url.endsWith("/install-resources") ? compatibility : state);
    });
    vi.stubGlobal("fetch", fetch);
    const container = await render();
    const card = container.querySelector(".creator-mock-scenario")!;
    expect(card.querySelectorAll(".creator-mock-resource-actions > button")).toHaveLength(1);
    expect(container.querySelector(".creator-mock-resource-row")).toBeNull();
    for (const name of ["推理展示", "工具调用与审批", "工具分组"]) expect(card.textContent).not.toContain(name);
    expect(container.querySelector(".creator-mock-preview-help")).toBeNull();
    await click(container, "安装资源");
    expect(installed).toEqual(["reasoning", "tool-approval", "tool-group"]);
    expect(container.querySelectorAll(".creator-mock-resource-row")).toHaveLength(0);
    expect(card.textContent).toContain("资源已安装并就绪，点击场景即可切换。");
    expect(fetch.mock.calls.some(([url]) => url.endsWith("/select"))).toBe(false);
  });

  it("preserves partial installation and retries only resources that are still missing", async () => {
    const state = { ...initial, scenarios: [{ id: "bundle", title: "Bundle", resources: ["first", "second", "third"] }] };
    const requirements = ["first", "second", "third"].map(id => ({ id, name: id, scenarioIds: ["bundle"], status: "missing", installable: true }));
    const compatibility = { projectId: "project", status: "checked", requirements };
    const installed: string[] = [];
    let fail = true;
    const fetch = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/install-resources")) {
        const { resourceId } = JSON.parse(String(init?.body));
        installed.push(resourceId);
        if (resourceId === "second" && fail) return new Response("{}", { status: 500, headers: { "Content-Type": "application/json" } });
        requirements.find(item => item.id === resourceId)!.status = "ready";
      }
      return json(url.endsWith("/compatibility") || url.endsWith("/install-resources") ? compatibility : state);
    });
    vi.stubGlobal("fetch", fetch);
    const container = await render();
    await act(async () => container.querySelector<HTMLInputElement>('input[type="radio"]')!.click());
    await click(container, "安装资源");
    expect(installed).toEqual(["first", "second"]);
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("second 资源安装失败");
    expect(fetch.mock.calls.some(([url]) => url.endsWith("/select"))).toBe(false);
    fail = false;
    await click(container, "安装资源");
    expect(installed).toEqual(["first", "second", "second", "third"]);
    await act(async () => container.querySelector<HTMLInputElement>('input[type="radio"]')!.click());
    expect(fetch.mock.calls.some(([url]) => url.endsWith("/select"))).toBe(true);
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
    expect(container.querySelector(".creator-mock-copy")?.textContent?.trim()).toBe("已复制");
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

it("downloads missing conversation form resources without selecting the scenario", async () => {
  const state = { ...initial, scenarios: [...initial.scenarios, frontendToolFillFormScenario] };
  let ready = false;
  const compatibility = () => ({ projectId: "project", canInstallResources: true, status: "checked", requirements: [{ id: "human-form-demo", name: "Form", scenarioIds: ["frontend-tool-fill-form"], status: ready ? "ready" : "missing", installable: true }] });
  const fetch = vi.fn(async (url: string) => {
    if (url.endsWith("/install-resources")) { ready = true; return json(compatibility()); }
    return json(url.endsWith("/compatibility") ? compatibility() : state);
  });
  vi.stubGlobal("fetch", fetch);
  const container = await render();
  expect([...container.querySelectorAll("button")].some(button => button.textContent === "运行场景")).toBe(false);
  expect(fetch.mock.calls.some(([url]) => url.endsWith("/select"))).toBe(false);
  await click(container, "安装资源");

  expect(fetch).toHaveBeenCalledWith(`${CREATOR_MOCK_API_PATH}/install-resources`, expect.objectContaining({ body: JSON.stringify({ projectId: "project", resourceId: "human-form-demo" }) }));
});

it.skip("shows the A2UI resource installation path and selects on click only after compatibility is ready", async () => {
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
  expect(card.textContent).toContain("安装资源");
  expect(card.textContent).not.toContain("Demo 资源已安装");
  await act(async () => card.querySelector<HTMLInputElement>('input[type="radio"]')!.click());
  expect([...card.querySelectorAll("button")].some(button => button.textContent === "运行场景")).toBe(false);
  expect(fetch.mock.calls.some(([url]) => url.endsWith("/select"))).toBe(false);
  expect(card.textContent).toContain("此场景需要额外的 Agent UI 资源，请先安装资源。");
  expect(card.textContent).not.toContain("此场景使用 Frontend Tools");
  expect(fetch.mock.calls.some(([url]) => url.endsWith("/select"))).toBe(false);
  await click(card, "安装资源");
  expect(fetch).toHaveBeenCalledWith(`${CREATOR_MOCK_API_PATH}/install-resources`, expect.objectContaining({ body: JSON.stringify({ projectId: "project", resourceId: "a2ui" }) }));
  expect(card.textContent).toContain("所需资源已就绪");
  expect(card.textContent).toContain("资源已安装并就绪，点击场景即可切换。");
  expect(card.textContent).not.toContain("并启用");

  await act(async () => card.querySelector<HTMLInputElement>('input[type="radio"]')!.click());
  expect(fetch).toHaveBeenCalledWith(`${CREATOR_MOCK_API_PATH}/select`, expect.objectContaining({ body: JSON.stringify({ scenarioId: "a2ui-interactive-order", speed: 1 }) }));
});

it("repairs the application-scoped conversation form resource", async () => {
  const state = { ...initial, scenarios: [...initial.scenarios, frontendToolFillFormScenario] };
  let enabled = false;
  const pluginId = "human-form-demo";
  const compatibility = () => ({
    ...inspectMockDemoCompatibility({
      pluginSources: [{ pluginId, status: "available", dataMessageUINames: [] }],
      pluginInstances: [{ id: "form", pluginId, enabled, effectiveEnabled: enabled, target: { type: "application" } }],
    }, { items: [{ id: "demo/human-form", status: "managed", owned: true, resolvedRequirements: [] }] }, "project"),
    canInstallResources: true,
  });
  const fetch = vi.fn(async (url: string) => {
    if (url.endsWith("/install-resources")) { enabled = true; return json(compatibility()); }
    return json(url.endsWith("/compatibility") ? compatibility() : state);
  });
  vi.stubGlobal("fetch", fetch);
  const container = await render();
  const card = [...container.querySelectorAll<HTMLElement>(".creator-mock-scenario")].find(element => element.textContent?.includes("会话内表单收集信息"))!;
  expect(card.textContent).toContain("RUN_FINISHED · success");
  expect(card.textContent).toContain("ToolMessage");
  expect(card.textContent).not.toContain("resume[]");
  await click(card, "安装资源");
  expect(fetch).toHaveBeenCalledWith(`${CREATOR_MOCK_API_PATH}/install-resources`, expect.objectContaining({ body: JSON.stringify({ projectId: "project", resourceId: "human-form-demo" }) }));
  expect(enabled).toBe(true);
  expect(fetch.mock.calls.some(([url]) => url.endsWith("/select"))).toBe(false);
});

it.skip("keeps missing A2UI packages installable without exposing implementation details in the DOM", async () => {
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
  const install = [...container.querySelectorAll("button")].find(button => button.textContent === "安装资源")!;
  expect(install.disabled).toBe(false);
  expect(container.textContent).not.toContain("当前项目尚未安装 A2UI 资源。");
  for (const token of ["@assistant-ui", "react-markdown", "remark-gfm", "pnpm add", "integration/a2ui", "A2UI Official Integration"]) expect(container.innerHTML).not.toContain(token);
});

it.skip("fetches technical details only after the developer opens a conflicting resource", async () => {
  const state = { ...initial, scenarios: [a2uiInteractiveOrderScenario] };
  const compatibility = { ...inspectMockDemoCompatibility({ pluginSources: [], pluginInstances: [] }, { items: [
    { id: "integration/a2ui", status: "managed", owned: true, resolvedRequirements: [{ name: "@assistant-ui/react-generative-ui", required: "0.0.21", declared: "0.0.18", installed: "0.0.18", compatible: false }] },
  ] }, "project"), canInstallResources: true };
  const fetch = vi.fn(async (url: string) => json(url.endsWith("/resource-diagnostics") ? { technicalDetails: { name: "@assistant-ui/react-generative-ui", installed: "0.0.18", required: "0.0.21" } } : url.endsWith("/compatibility") ? compatibility : state));
  vi.stubGlobal("fetch", fetch);
  const container = await render();
  expect(container.textContent).not.toContain("A2UI 资源与当前项目存在兼容性冲突。");
  expect([...container.querySelectorAll("button")].find(button => button.textContent === "安装资源")!.disabled).toBe(true);
  expect(container.textContent).not.toContain("@assistant-ui");
  expect(fetch.mock.calls.some(([url]) => url.endsWith("/resource-diagnostics"))).toBe(false);
  const details = container.querySelector<HTMLDetailsElement>(".creator-mock-resource-diagnostics")!;
  await act(async () => { details.open = true; details.dispatchEvent(new Event("toggle")); });
  expect(fetch).toHaveBeenCalledWith(`${CREATOR_MOCK_API_PATH}/resource-diagnostics`, expect.objectContaining({ body: JSON.stringify({ projectId: "project", resourceId: "a2ui" }) }));
  expect(details.textContent).toContain("@assistant-ui/react-generative-ui");
});

it("hides deferred A2UI examples even when an older service returns them", async () => {
  const state = { ...initial, scenarios: [...initial.scenarios, a2uiInteractiveOrderScenario] };
  vi.stubGlobal("fetch", vi.fn(async (url: string) => json(url.endsWith("/compatibility") ? { projectId: "project", status: "checked", requirements: [] } : state)));
  const container = await render();
  expect(container.textContent).not.toContain("A2UI");
  expect(container.querySelector('[data-scenario-id="a2ui-interactive-order"]')).toBeNull();
});
