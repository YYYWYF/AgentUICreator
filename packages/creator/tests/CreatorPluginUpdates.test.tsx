// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { CreatorPluginUpdates } from "../src/ui/CreatorPluginUpdates.js";
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root;
afterEach(() => { if (root) act(() => root.unmount()); document.body.replaceChildren(); localStorage.clear(); vi.unstubAllGlobals(); });
const inspection = { releaseVersion: "0.0.2", compatibility: "compatible", fingerprint: "surface@0.0.2", plugins: [{ pluginId: "conversation-surface", name: "Conversation Surface", currentVersion: "0.0.1", targetVersion: "0.0.2", sourceRelease: "0.0.1", status: "managed", updateAvailable: true, changelog: [{ version: "0.0.2", entry: { summary: "更新", changes: ["修复显示"] } }] }] };
async function mount(counter = 0) {
  const container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  const props = { workspaceId: "project", busy: false, modelReady: true, onPageChange: vi.fn(), onModelMerge: vi.fn() };
  await act(async () => root.render(<CreatorPluginUpdates {...props} checkRequest={counter} />));
  return { container, props };
}
async function click(container: HTMLElement, text: string) {
  const button = [...container.querySelectorAll("button")].find(button => button.textContent === text)!;
  await act(async () => button.click());
}
it("dismisses the same update set but manual checks still reveal it, and new sets notify again", async () => {
  const fetch = vi.fn(async () => new Response(JSON.stringify(inspection))); vi.stubGlobal("fetch", fetch);
  const { container, props } = await mount();
  expect(container.textContent).toContain("有 1 个插件可以更新");
  await click(container, "×");
  act(() => root.unmount());
  root = createRoot(container);
  await act(async () => root.render(<CreatorPluginUpdates {...props} checkRequest={0} />));
  expect(container.textContent).not.toContain("有 1 个插件可以更新");
  await act(async () => root.render(<CreatorPluginUpdates {...props} checkRequest={1} />));
  expect(container.textContent).toContain("插件更新");
  await click(container, "← 返回");
  fetch.mockImplementation(async () => new Response(JSON.stringify({ ...inspection, fingerprint: "surface@0.0.3" })));
  act(() => root.unmount()); root = createRoot(container);
  await act(async () => root.render(<CreatorPluginUpdates {...props} checkRequest={1} />));
  expect(container.textContent).toContain("有 1 个插件可以更新");
});
it("does not execute until the displayed dependency plan is explicitly confirmed", async () => {
  const routes: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    routes.push(url);
    return new Response(JSON.stringify(url.endsWith("/plan") ? { id: "plan", releaseVersion: "0.0.2", compatibility: "compatible", requiresMerge: false, blocked: false, fileCount: 8, issues: [], requestedPlugins: ["conversation-surface"], items: [{ itemId: "foundation/core", status: "managed", changed: true, provided: false, currentVersion: null, targetVersion: null, paths: ["index.ts"] }] } : inspection));
  }));
  const { container } = await mount();
  await click(container, "查看更新"); await click(container, "查看升级计划");
  expect(container.textContent).toContain("foundation/core");
  expect(routes.some(route => route.endsWith("/execute"))).toBe(false);
  await click(container, "确认更新");
  expect(routes.filter(route => route.endsWith("/execute"))).toHaveLength(1);
});
