// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { AgentConnectionPanel, readAgentConnection } from "../src/ui/AgentConnectionPanel.js";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | undefined;
afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = undefined; document.body.replaceChildren(); vi.unstubAllGlobals();
});
const state = { activeSource: "mock", configured: false, running: false };
function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
}

it("explains an HTML response in Chinese and recovers through retry", async () => {
  const fetcher = vi.fn()
    .mockResolvedValueOnce(new Response("<!doctype html><html></html>", { headers: { "Content-Type": "text/html" } }))
    .mockResolvedValueOnce(json(state));
  vi.stubGlobal("fetch", fetcher);
  const container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  await act(async () => root!.render(<AgentConnectionPanel workspaceId="project" visible />));
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("请重启服务后重试");
  expect(container.textContent).not.toMatch(/Unexpected token|not valid JSON|Connect your Agent|CORS issues/);
  const button = [...container.querySelectorAll("button")].find(button => button.textContent === "重新读取连接设置")!;
  await act(async () => button.click());
  expect(container.querySelector('[role="alert"]')).toBeNull();
  const mock = [...container.querySelectorAll("button")].find(button => button.textContent === "使用示例 Agent")!;
  expect(mock.disabled).toBe(false);
  expect(container.querySelector("details")?.textContent).toContain("不依赖 Creator");
});

it("handles malformed JSON, invalid state and network failures without raw exceptions", async () => {
  vi.stubGlobal("fetch", vi.fn()
    .mockResolvedValueOnce(new Response("{broken", { headers: { "Content-Type": "application/json" } }))
    .mockResolvedValueOnce(json({ status: "ok" }))
    .mockRejectedValueOnce(new TypeError("Failed to fetch")));
  await expect(readAgentConnection("project")).rejects.toThrow("暂时无法读取连接设置");
  await expect(readAgentConnection("project")).rejects.toThrow("暂时无法读取连接设置");
  await expect(readAgentConnection("project")).rejects.toThrow("无法连接 Creator 开发服务");
});

it("translates known errors and gives a safe Chinese fallback for unknown server failures", async () => {
  vi.stubGlobal("fetch", vi.fn()
    .mockResolvedValueOnce(json({ error: "Stop the current run before switching Agent source." }, 409))
    .mockResolvedValueOnce(json({ error: "EACCES: permission denied at private/path" }, 400)));
  await expect(readAgentConnection("project", { activeSource: "mock" })).rejects.toThrow("请先停止当前运行");
  await expect(readAgentConnection("project", { activeSource: "mock" })).rejects.toThrow("连接设置未保存");
});
