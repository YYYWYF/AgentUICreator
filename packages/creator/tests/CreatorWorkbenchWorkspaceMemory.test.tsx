// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.mock("../src/ui/workspaceClient.js", async importOriginal => ({
  ...await importOriginal<typeof import("../src/ui/workspaceClient.js")>(),
  getWorkspaceState: vi.fn(),
  selectWorkspaceProject: vi.fn(),
  clearWorkspaceProject: vi.fn(),
}));
vi.mock("../src/ui/CreatorPluginUpdates.js", () => ({ CreatorPluginUpdates: () => null }));
vi.mock("../src/ui/MockServicePanel.js", () => ({ MockServicePanel: () => null }));

import { CreatorWorkbench } from "../src/ui/CreatorWorkbench.js";
import { clearWorkspaceProject, getWorkspaceState, selectWorkspaceProject } from "../src/ui/workspaceClient.js";
import { CREATOR_API_PATH } from "../src/shared.js";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const key = "agent-ui-creator-selected-project-root";
const roots: Root[] = [];
const ready = (displayPath: string) => ({
  status: "ready" as const,
  workspace: { id: "workspace-1", name: "Project", displayPath },
  project: { mode: "assistant" as const, sourceRoot: "src/agent-ui" },
  runtime: { status: "ready" as const },
});

async function mount() {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  await act(async () => { root.render(<CreatorWorkbench>Preview</CreatorWorkbench>); });
  return { root, container };
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  vi.mocked(getWorkspaceState).mockReset().mockResolvedValue({ status: "none" });
  vi.mocked(selectWorkspaceProject).mockReset();
  vi.mocked(clearWorkspaceProject).mockReset().mockResolvedValue({ status: "none" });
  HTMLElement.prototype.scrollTo = vi.fn();
});
afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount());
  document.body.replaceChildren();
  localStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("rebuilds a refreshed panel from the original baseline and original run without submitting it again", async () => {
  vi.mocked(getWorkspaceState).mockResolvedValueOnce(ready("/work/project"));
  const storage = "agent-ui-creator-conversation:workspace-1";
  const user = { kind: "message", id: "user-1", role: "user", content: "修改欢迎语" };
  const baseline = { threadId: "thread-1", items: [user], agentMessages: [{ id: "user-1", role: "user", content: "修改欢迎语" }] };
  sessionStorage.setItem(storage, JSON.stringify({ ...baseline, items: [user, { kind: "message", id: "reply", role: "assistant", content: "一半", streaming: true }] }));
  sessionStorage.setItem("agent-ui-creator-conversation:active-run:workspace-1", JSON.stringify({ ...baseline, runId: "original-run" }));
  const fetcher = vi.fn(async (url: string) => url.startsWith(CREATOR_API_PATH + "?") ? new Response([
    { type: "RUN_STARTED", threadId: "thread-1", runId: "original-run" },
    { type: "TEXT_MESSAGE_START", messageId: "reply", role: "assistant" },
    { type: "TEXT_MESSAGE_CONTENT", messageId: "reply", delta: "完整完成" },
    { type: "TEXT_MESSAGE_END", messageId: "reply" },
    { type: "RUN_FINISHED", threadId: "thread-1", runId: "original-run" },
  ].map(event => `data: ${JSON.stringify(event)}\n\n`).join(""), { headers: { "Content-Type": "text/event-stream" } }) : Response.json({ commands: [] }));
  vi.stubGlobal("fetch", fetcher);
  const { container } = await mount();
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 30)); });
  expect(container.textContent).toContain("完整完成");
  expect(container.textContent).not.toContain("一半");
  const requests = fetcher.mock.calls.filter(([url]) => url.startsWith(CREATOR_API_PATH));
  expect(requests).toHaveLength(1);
  expect(requests[0]?.[0]).toContain("runId=original-run");
  expect(sessionStorage.getItem("agent-ui-creator-conversation:active-run:workspace-1")).toBeNull();
  const saved = JSON.parse(sessionStorage.getItem(storage)!);
  expect(saved.agentMessages.filter((item: { role: string }) => item.role === "user")).toHaveLength(1);
});

it("retains an unavailable subscription and uses panel refresh to reconnect without restarting the worker", async () => {
  vi.mocked(getWorkspaceState).mockResolvedValueOnce(ready("/work/project"));
  const baseline = { threadId: "thread-1", items: [], agentMessages: [] };
  const pendingKey = "agent-ui-creator-conversation:active-run:workspace-1";
  sessionStorage.setItem("agent-ui-creator-conversation:workspace-1", JSON.stringify(baseline));
  sessionStorage.setItem(pendingKey, JSON.stringify({ ...baseline, runId: "original-run" }));
  let attempts = 0;
  const fetcher = vi.fn(async (url: string) => {
    if (!url.startsWith(CREATOR_API_PATH + "?")) return Response.json({ commands: [] });
    if (++attempts === 1) throw Object.assign(new Error("offline"), { code: "CREATOR_RUN_CONNECTION_LOST" });
    return new Response([
      { type: "RUN_STARTED", threadId: "thread-1", runId: "original-run" },
      { type: "RUN_FINISHED", threadId: "thread-1", runId: "original-run" },
    ].map(event => `data: ${JSON.stringify(event)}\n\n`).join(""), { headers: { "Content-Type": "text/event-stream" } });
  });
  vi.stubGlobal("fetch", fetcher);
  const { container } = await mount();
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
  expect(sessionStorage.getItem(pendingKey)).not.toBeNull();
  await act(async () => { (container.querySelector(".creator-composer-clear") as HTMLButtonElement).click(); });
  expect(sessionStorage.getItem(pendingKey)).not.toBeNull();
  expect(JSON.parse(sessionStorage.getItem("agent-ui-creator-conversation:workspace-1")!).threadId).toBe("thread-1");
  await act(async () => { (container.querySelector('button[aria-label="刷新"]') as HTMLButtonElement).click(); });
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
  expect(attempts).toBe(2);
  expect(sessionStorage.getItem(pendingKey)).toBeNull();
  expect(fetcher.mock.calls.some(([url]) => url.endsWith("/workspace/refresh"))).toBe(false);
});

it("asks for a project on first use without implicitly selecting the launch directory", async () => {
  const { container } = await mount();
  expect(container.querySelector("#creator-workspace-menu")).not.toBeNull();
  expect(selectWorkspaceProject).not.toHaveBeenCalled();
  expect(localStorage.getItem(key)).toBeNull();
});

it.each(["/work/项目 alpha", "C:\\work\\项目 alpha"])("remembers and restores the selected path after the server restarts: %s", async displayPath => {
  vi.mocked(getWorkspaceState).mockResolvedValueOnce(ready(displayPath));
  const first = await mount();
  expect(localStorage.getItem(key)).toBe(displayPath);
  act(() => first.root.unmount());
  roots.splice(roots.indexOf(first.root), 1);

  vi.mocked(selectWorkspaceProject).mockResolvedValue(ready(displayPath));
  const next = await mount();
  expect(selectWorkspaceProject).toHaveBeenCalledWith(displayPath, expect.anything());
  expect(next.container.querySelector("#creator-workspace-menu")).toBeNull();
  expect(localStorage.getItem(key)).toBe(displayPath);
});

it("clears an invalid saved path and returns to project selection", async () => {
  localStorage.setItem(key, "C:\\missing-project");
  vi.mocked(selectWorkspaceProject).mockRejectedValue(new Error("PROJECT_NOT_FOUND"));
  const { container } = await mount();
  expect(localStorage.getItem(key)).toBeNull();
  expect(container.querySelector("#creator-workspace-menu")).not.toBeNull();
  expect(container.textContent).toContain("PROJECT_NOT_FOUND");
});

it("forgets the saved project when the user closes it", async () => {
  vi.mocked(getWorkspaceState).mockResolvedValueOnce(ready("/work/project"));
  const { container } = await mount();
  await act(async () => { (container.querySelector(".creator-workspace-trigger") as HTMLButtonElement).click(); });
  await act(async () => { (container.querySelector(".creator-workspace-close button") as HTMLButtonElement).click(); });
  expect(clearWorkspaceProject).toHaveBeenCalledTimes(1);
  expect(localStorage.getItem(key)).toBeNull();
  expect(container.querySelector("#creator-workspace-menu")).not.toBeNull();
});
