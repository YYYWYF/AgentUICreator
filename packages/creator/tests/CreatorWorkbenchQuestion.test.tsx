// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.mock("../src/ui/workspaceClient.js", async importOriginal => ({
  ...await importOriginal<typeof import("../src/ui/workspaceClient.js")>(),
  getWorkspaceState: vi.fn(async () => ({ status: "ready", workspace: { id: "workspace-1", name: "Project", displayPath: "/project" },
    project: { version: "1", mode: "platform" }, runtime: { status: "ready" } })),
}));
vi.mock("../src/ui/MockServicePanel.js", () => ({ MockServicePanel: () => null }));

import { CreatorWorkbench } from "../src/ui/CreatorWorkbench.js";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const roots: Root[] = [];
const question = { kind: "question", id: "question-interrupt-1", interruptId: "interrupt-1", status: "pending",
  steps: [{ id: "layout", question: "Layout?", selectionMode: "single", minSelections: 1, maxSelections: 1,
    options: [{ id: "dashboard", label: "Dashboard" }, { id: "sidebar", label: "Sidebar" }] }] };

function stream(events: Record<string, unknown>[]): Response {
  return new Response(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join(""),
    { headers: { "Content-Type": "text/event-stream" } });
}

async function mount(): Promise<{ root: Root; container: HTMLDivElement }> {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  await act(async () => { root.render(<CreatorWorkbench previewWorkspaceId="workspace-1">Preview</CreatorWorkbench>); });
  return { root, container };
}

beforeEach(() => {
  sessionStorage.clear();
  sessionStorage.setItem("agent-ui-creator-conversation:workspace-1", JSON.stringify({
    threadId: "thread-1", items: [question], agentMessages: [{ id: "user-1", role: "user", content: "Design" }],
  }));
  HTMLElement.prototype.scrollTo = vi.fn();
});
afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount());
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

it("keeps the pending thread across reload, blocks abandon actions and resumes only once", async () => {
  let complete!: (response: Response) => void;
  const fetch = vi.fn(async () => new Promise<Response>(resolve => { complete = resolve; }));
  vi.stubGlobal("fetch", fetch);
  const first = await mount();
  expect((first.container.querySelector("#creator-request") as HTMLTextAreaElement).disabled).toBe(true);
  const newConversation = first.container.querySelector('[aria-label="新建 Creator 会话"]') as HTMLButtonElement;
  expect(newConversation.disabled).toBe(true);
  expect(newConversation.title).toBe("请先回答当前问题");
  expect((first.container.querySelector(".creator-workspace-trigger") as HTMLButtonElement).disabled).toBe(true);
  act(() => first.root.unmount());
  roots.splice(roots.indexOf(first.root), 1);

  const { container } = await mount();
  expect(container.textContent).toContain("Layout?");
  await act(async () => { (container.querySelector('.creator-question-card input') as HTMLInputElement).click(); });
  const submit = container.querySelector('.creator-question-card button') as HTMLButtonElement;
  await act(async () => { submit.click(); submit.click(); });
  expect(fetch).toHaveBeenCalledTimes(1);
  const body = JSON.parse(String((fetch.mock.calls[0] as unknown as [string, RequestInit])[1].body));
  expect(body.threadId).toBe("thread-1");
  expect(body.forwardedProps.command.resume).toEqual({ interruptId: "interrupt-1", answers: { layout: ["dashboard"] } });
  expect(body.messages).toEqual([{ id: "user-1", role: "user", content: "Design" }]);
  await act(async () => complete(stream([
    { type: "RUN_STARTED", threadId: "thread-1", runId: body.runId },
    { type: "RUN_FINISHED", threadId: "thread-1", runId: body.runId },
  ])));
  expect(container.querySelectorAll(".creator-question-card input")).toHaveLength(0);
  expect(container.textContent).toContain("Dashboard");
  expect(container.textContent).not.toContain("Sidebar");
  expect((container.querySelector('[aria-label="新建 Creator 会话"]') as HTMLButtonElement).disabled).toBe(false);
});

it.each(["CREATOR_INTERRUPT_NOT_FOUND", "CREATOR_INTERRUPT_CONTEXT_INVALID"])("marks a lost question stale and permits a fresh thread for %s", async code => {
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    return stream([{ type: "RUN_STARTED", threadId: "thread-1", runId: body.runId },
      { type: "RUN_ERROR", code, message: "Expired" }]);
  }));
  const { container } = await mount();
  await act(async () => { (container.querySelector('.creator-question-card input') as HTMLInputElement).click(); });
  await act(async () => { (container.querySelector('.creator-question-card button') as HTMLButtonElement).click(); });
  expect(container.textContent).toContain("执行状态已经失效");
  expect(container.querySelectorAll(".creator-question-card input")).toHaveLength(0);
  const newConversation = container.querySelector('[aria-label="新建 Creator 会话"]') as HTMLButtonElement;
  expect(newConversation.disabled).toBe(false);
  await act(async () => newConversation.click());
  expect(container.textContent).not.toContain("Layout?");
});

it("renders a deferred development decision receipt without a false error", async () => {
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    return stream([
      { type: "RUN_STARTED", threadId: "thread-1", runId: body.runId },
      { type: "RUN_FINISHED", threadId: "thread-1", runId: body.runId, result: {
        receipt: { files: [], validations: [], verification: {
          status: "decision-no-project-change", projectRevision: 0,
          auditAttempts: 0, checks: [{ id: "development-decision", status: "passed", evidence: "defer" }],
        } },
      } },
    ]);
  }));
  const { container } = await mount();
  await act(async () => { (container.querySelector('.creator-question-card input') as HTMLInputElement).click(); });
  await act(async () => { (container.querySelector('.creator-question-card button') as HTMLButtonElement).click(); });

  expect(container.textContent).toContain("已按用户决定结束，项目未修改");
  expect(container.textContent).toContain("0 个文件");
  expect(container.textContent).not.toContain("无效的修改回执");
});
